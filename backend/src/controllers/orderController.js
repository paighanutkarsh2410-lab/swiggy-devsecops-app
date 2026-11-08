import pool from "../db/pool.js";
import { isValidId } from "../middleware/validateId.js";
import { isPartner } from "../middleware/auth.js";
import { canMove, isKnownStatus, ORDER_COLUMNS } from "../orders/statusFlow.js";

const MAX_ITEM_QUANTITY = 50;
const MAX_ORDER_LINES = 50;
const MAX_NAME_LENGTH = 150;
const MAX_ADDRESS_LENGTH = 1000;

export function isPartnerOf(user, restaurantId) {
  return isPartner(user) && String(user.restaurant_id) === String(restaurantId);
}

function canViewOrder(user, order) {
  return (
    String(order.user_id) === String(user.id) ||
    isPartnerOf(user, order.restaurant_id)
  );
}

function parseOrderRequest(body) {
  const { restaurant_id, customer_name, customer_address, items } = body ?? {};
  const name = typeof customer_name === "string" ? customer_name.trim() : "";
  const address =
    typeof customer_address === "string" ? customer_address.trim() : "";

  if (
    !isValidId(restaurant_id) ||
    !name ||
    !address ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return {
      error: "restaurant_id, customer_name, customer_address and items are required"
    };
  }

  if (name.length > MAX_NAME_LENGTH || address.length > MAX_ADDRESS_LENGTH) {
    return { error: "Customer name or address is too long" };
  }

  if (items.length > MAX_ORDER_LINES) {
    return { error: "Too many items in this order" };
  }

  // Repeated menu items are merged into a single order line.
  const quantities = new Map();

  for (const item of items) {
    if (!isValidId(item?.menu_item_id)) {
      return { error: "One or more menu items are invalid for this restaurant" };
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { error: "Item quantity must be a positive integer" };
    }

    const id = String(item.menu_item_id);
    const quantity = (quantities.get(id) ?? 0) + item.quantity;

    if (quantity > MAX_ITEM_QUANTITY) {
      return { error: `Item quantity cannot be more than ${MAX_ITEM_QUANTITY}` };
    }

    quantities.set(id, quantity);
  }

  return { restaurantId: restaurant_id, name, address, quantities };
}

export async function createOrder(req, res) {
  const parsed = parseOrderRequest(req.body);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { restaurantId, name, address, quantities } = parsed;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const restaurantResult = await client.query(
      `
      SELECT id, is_open
      FROM restaurants
      WHERE id = $1
        AND is_active = TRUE
      `,
      [restaurantId]
    );

    if (restaurantResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    if (!restaurantResult.rows[0].is_open) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "This restaurant is not accepting orders right now"
      });
    }

    const menuResult = await client.query(
      `
      SELECT id, price, (is_available AND NOT is_archived) AS is_available
      FROM menu_items
      WHERE restaurant_id = $1
        AND id = ANY($2::bigint[])
      `,
      [restaurantId, [...quantities.keys()]]
    );

    if (menuResult.rows.length !== quantities.size) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "One or more menu items are invalid for this restaurant"
      });
    }

    let totalAmount = 0;

    for (const menuItem of menuResult.rows) {
      if (!menuItem.is_available) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Menu item ${menuItem.id} is unavailable`
        });
      }

      totalAmount += Number(menuItem.price) * quantities.get(String(menuItem.id));
    }

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        user_id,
        restaurant_id,
        customer_name,
        customer_address,
        total_amount
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${ORDER_COLUMNS}
      `,
      [req.user.id, restaurantId, name, address, totalAmount]
    );

    const order = orderResult.rows[0];

    for (const menuItem of menuResult.rows) {
      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          menu_item_id,
          quantity,
          unit_price
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          order.id,
          menuItem.id,
          quantities.get(String(menuItem.id)),
          menuItem.price
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Order created successfully",
      order
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Failed to create order:", error);

    res.status(500).json({
      error: "Failed to create order"
    });
  } finally {
    client.release();
  }
}

export async function getMyOrders(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT
        o.id,
        o.restaurant_id,
        r.name AS restaurant_name,
        o.total_amount,
        o.status,
        o.created_at
      FROM orders o
      JOIN restaurants r
        ON r.id = o.restaurant_id
      WHERE o.user_id = $1
      ORDER BY o.id DESC
      LIMIT 100
      `,
      [req.user.id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Failed to fetch orders:", error);

    res.status(500).json({
      error: "Failed to fetch orders"
    });
  }
}

export async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const orderResult = await pool.query(
      `
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE id = $1
      `,
      [id]
    );

    const order = orderResult.rows[0];

    // Other people's orders look the same as orders that do not exist.
    if (!order || !canViewOrder(req.user, order)) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    const itemsResult = await pool.query(
      `
      SELECT
        oi.id,
        oi.menu_item_id,
        mi.name,
        oi.quantity,
        oi.unit_price
      FROM order_items oi
      JOIN menu_items mi
        ON mi.id = oi.menu_item_id
      WHERE oi.order_id = $1
      ORDER BY oi.id
      `,
      [id]
    );

    res.status(200).json({
      ...order,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error("Failed to fetch order:", error);

    res.status(500).json({
      error: "Failed to fetch order"
    });
  }
}

// Customers can only cancel their own order, and only before the restaurant
// accepts it. Restaurants change status through the partner API.
export async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const status = req.body?.status;

    if (!isKnownStatus(status)) {
      return res.status(400).json({
        error: "Invalid order status"
      });
    }

    const currentResult = await pool.query(
      `
      SELECT id, user_id, restaurant_id, status
      FROM orders
      WHERE id = $1
      `,
      [id]
    );

    const current = currentResult.rows[0];

    if (!current || !canViewOrder(req.user, current)) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    const isOwnOrder = String(current.user_id) === String(req.user.id);

    if (!isOwnOrder || status !== "CANCELLED" || current.status !== "PLACED") {
      return res.status(403).json({
        error: "You cannot make this status change"
      });
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
        updated_at = NOW()
      WHERE id = $2
        AND status = $3
      RETURNING ${ORDER_COLUMNS}
      `,
      [status, id, current.status]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Order status has already changed"
      });
    }

    res.status(200).json({
      message: "Order status updated successfully",
      order: result.rows[0]
    });
  } catch (error) {
    console.error("Failed to update order status:", error);

    res.status(500).json({
      error: "Failed to update order status"
    });
  }
}
