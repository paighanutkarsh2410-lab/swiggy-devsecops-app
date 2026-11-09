// API for the restaurant partner console. Every handler runs after
// requireAuth and requirePartner, so req.user is an OWNER or STAFF member of
// exactly one restaurant, and every query is limited to that restaurant.
import pool from "../db/pool.js";
import { subscribeToRestaurant } from "../events/orderEvents.js";
import { orderStatusChanges, partnerEventStreams } from "../metrics.js";
import {
  ACTIVE_STATUSES,
  canMove,
  isKnownStatus,
  NEXT_STATUSES,
  ORDER_COLUMNS
} from "../orders/statusFlow.js";

const MIN_PREP_MINUTES = 5;
const MAX_PREP_MINUTES = 120;
const MAX_ITEM_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PRICE = 100000;
const HEARTBEAT_MS = 25000;

const MENU_COLUMNS = `id, name, description, price, is_veg, is_available`;

function serverError(res, message, error) {
  console.error(`${message}:`, error);
  res.status(500).json({ error: message });
}

export async function getPartnerProfile(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT id, name, cuisine, address, delivery_time_minutes, is_open
      FROM restaurants
      WHERE id = $1
      `,
      [req.user.restaurant_id]
    );

    res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      restaurant: result.rows[0]
    });
  } catch (error) {
    serverError(res, "Failed to load restaurant", error);
  }
}

// Open or close the restaurant for new orders.
export async function updateRestaurant(req, res) {
  const isOpen = req.body?.is_open;

  if (typeof isOpen !== "boolean") {
    return res.status(400).json({ error: "is_open must be true or false" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE restaurants
      SET is_open = $1
      WHERE id = $2
      RETURNING id, name, cuisine, address, delivery_time_minutes, is_open
      `,
      [isOpen, req.user.restaurant_id]
    );

    res.status(200).json({ restaurant: result.rows[0] });
  } catch (error) {
    serverError(res, "Failed to update restaurant", error);
  }
}

export async function listOrders(req, res) {
  const activeOnly = req.query.scope !== "all";

  try {
    const result = await pool.query(
      `
      SELECT
        o.id,
        o.user_id,
        o.restaurant_id,
        o.customer_name,
        o.customer_address,
        o.total_amount,
        o.status,
        o.prep_minutes,
        o.ready_by,
        o.created_at,
        o.updated_at,
        COALESCE(
          json_agg(
            json_build_object('name', mi.name, 'quantity', oi.quantity)
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.restaurant_id = $1
        AND ($2::boolean = FALSE OR o.status = ANY($3::text[]))
      GROUP BY o.id
      ORDER BY o.id DESC
      LIMIT 100
      `,
      [req.user.restaurant_id, activeOnly, ACTIVE_STATUSES]
    );

    res.status(200).json(
      result.rows.map((order) => ({
        ...order,
        next_statuses: NEXT_STATUSES[order.status]
      }))
    );
  } catch (error) {
    serverError(res, "Failed to fetch restaurant orders", error);
  }
}

// Accept (CONFIRMED, with a preparation time), reject (CANCELLED) or move
// an order along. Only orders of the partner's own restaurant can change.
export async function updateOrderStatus(req, res) {
  const { id } = req.params;
  const status = req.body?.status;
  const prepMinutes = req.body?.prep_minutes;

  if (!isKnownStatus(status)) {
    return res.status(400).json({ error: "Invalid order status" });
  }

  const accepting = status === "CONFIRMED";

  if (
    accepting &&
    (!Number.isInteger(prepMinutes) ||
      prepMinutes < MIN_PREP_MINUTES ||
      prepMinutes > MAX_PREP_MINUTES)
  ) {
    return res.status(400).json({
      error: `prep_minutes must be a whole number from ${MIN_PREP_MINUTES} to ${MAX_PREP_MINUTES} when accepting an order`
    });
  }

  try {
    const currentResult = await pool.query(
      `
      SELECT id, status
      FROM orders
      WHERE id = $1
        AND restaurant_id = $2
      `,
      [id, req.user.restaurant_id]
    );

    const current = currentResult.rows[0];

    // Another restaurant's orders look the same as orders that do not exist.
    if (!current) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!canMove(current.status, status)) {
      return res.status(409).json({
        error: `Order cannot move from ${current.status} to ${status}`
      });
    }

    // Matching on the old status stops two updates racing each other.
    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = $1,
        prep_minutes = CASE WHEN $4::int IS NULL THEN prep_minutes ELSE $4::int END,
        ready_by = CASE WHEN $4::int IS NULL THEN ready_by ELSE NOW() + make_interval(mins => $4::int) END,
        updated_at = NOW()
      WHERE id = $2
        AND status = $3
      RETURNING ${ORDER_COLUMNS}
      `,
      [status, id, current.status, accepting ? prepMinutes : null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Order status has already changed" });
    }

    const order = result.rows[0];

    orderStatusChanges.inc({ status, actor: "partner" });

    res.status(200).json({
      message: "Order status updated successfully",
      order: { ...order, next_statuses: NEXT_STATUSES[order.status] }
    });
  } catch (error) {
    serverError(res, "Failed to update order status", error);
  }
}

export async function listMenu(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT ${MENU_COLUMNS}
      FROM menu_items
      WHERE restaurant_id = $1
        AND is_archived = FALSE
      ORDER BY id
      `,
      [req.user.restaurant_id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    serverError(res, "Failed to fetch menu", error);
  }
}

// Checks menu item fields. With partial, only the fields present are checked.
function parseMenuFields(body, { partial }) {
  const fields = {};
  const input = body ?? {};

  if (!partial || "name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";

    if (!name || name.length > MAX_ITEM_NAME_LENGTH) {
      return { error: `name is required and must be at most ${MAX_ITEM_NAME_LENGTH} characters` };
    }

    fields.name = name;
  }

  if ("description" in input) {
    const { description } = input;

    if (description !== null && typeof description !== "string") {
      return { error: "description must be text" };
    }

    const text = description?.trim() ?? "";

    if (text.length > MAX_DESCRIPTION_LENGTH) {
      return { error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters` };
    }

    fields.description = text || null;
  }

  if (!partial || "price" in input) {
    const price = typeof input.price === "string" ? Number(input.price) : input.price;

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > MAX_PRICE ||
      // Allows 249.99 despite floating-point rounding, rejects 249.999.
      Math.abs(Math.round(price * 100) - price * 100) > 1e-6
    ) {
      return { error: `price must be from 0 to ${MAX_PRICE} with at most 2 decimal places` };
    }

    fields.price = price.toFixed(2);
  }

  for (const flag of ["is_veg", "is_available"]) {
    if (flag in input) {
      if (typeof input[flag] !== "boolean") {
        return { error: `${flag} must be true or false` };
      }

      fields[flag] = input[flag];
    }
  }

  return { fields };
}

export async function createMenuItem(req, res) {
  const { error, fields } = parseMenuFields(req.body, { partial: false });

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO menu_items (restaurant_id, name, description, price, is_veg, is_available)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${MENU_COLUMNS}
      `,
      [
        req.user.restaurant_id,
        fields.name,
        fields.description ?? null,
        fields.price,
        fields.is_veg ?? true,
        fields.is_available ?? true
      ]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    serverError(res, "Failed to create menu item", error);
  }
}

// Owners can change any field. Staff can only mark an item sold out or back
// in stock.
export async function updateMenuItem(req, res) {
  const { error, fields } = parseMenuFields(req.body, { partial: true });

  if (error) {
    return res.status(400).json({ error });
  }

  const names = Object.keys(fields);

  if (names.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  if (req.user.role !== "OWNER" && names.some((name) => name !== "is_available")) {
    return res.status(403).json({
      error: "Staff can only change whether an item is available"
    });
  }

  // Column names come from the fixed list in parseMenuFields, never from the request.
  const assignments = names.map((name, index) => `${name} = $${index + 3}`);

  try {
    const result = await pool.query(
      `
      UPDATE menu_items
      SET ${assignments.join(", ")}
      WHERE id = $1
        AND restaurant_id = $2
        AND is_archived = FALSE
      RETURNING ${MENU_COLUMNS}
      `,
      [req.params.id, req.user.restaurant_id, ...names.map((name) => fields[name])]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    res.status(200).json({ item: result.rows[0] });
  } catch (error) {
    serverError(res, "Failed to update menu item", error);
  }
}

// Removes an item from the menu. It is archived rather than deleted because
// past orders still refer to it.
export async function archiveMenuItem(req, res) {
  try {
    const result = await pool.query(
      `
      UPDATE menu_items
      SET is_archived = TRUE, is_available = FALSE
      WHERE id = $1
        AND restaurant_id = $2
        AND is_archived = FALSE
      RETURNING id
      `,
      [req.params.id, req.user.restaurant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    res.status(204).end();
  } catch (error) {
    serverError(res, "Failed to remove menu item", error);
  }
}

// Server-Sent Events stream of new orders and status changes for the
// partner's restaurant. The console reloads its order list on each event.
export async function streamOrderEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tells Nginx not to buffer the stream.
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 5000\n\n");

  let closed = false;
  let unsubscribe = () => {};
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), HEARTBEAT_MS);

  partnerEventStreams.inc();

  req.on("close", () => {
    closed = true;
    partnerEventStreams.dec();
    clearInterval(heartbeat);
    unsubscribe();
  });

  const stop = await subscribeToRestaurant(req.user.restaurant_id, (event) => {
    res.write(`event: order\ndata: ${JSON.stringify(event)}\n\n`);
  });

  if (closed) {
    stop();
    return;
  }

  unsubscribe = stop;
  res.write("event: ready\ndata: {}\n\n");
}
