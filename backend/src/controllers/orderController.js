import pool from "../db/pool.js";

export async function createOrder(req, res) {
  const client = await pool.connect();

  try {
    const {
      restaurant_id,
      customer_name,
      customer_address,
      items
    } = req.body;

    // Basic request validation
    if (
      !restaurant_id ||
      !customer_name ||
      !customer_address ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: "restaurant_id, customer_name, customer_address and items are required"
      });
    }

    await client.query("BEGIN");

    // Verify restaurant
    const restaurantResult = await client.query(
      `
      SELECT id
      FROM restaurants
      WHERE id = $1
        AND is_active = TRUE
      `,
      [restaurant_id]
    );

    if (restaurantResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    // Fetch requested menu items
    const menuItemIds = items.map((item) => item.menu_item_id);

    const menuResult = await client.query(
      `
      SELECT id, price, is_available
      FROM menu_items
      WHERE restaurant_id = $1
        AND id = ANY($2::bigint[])
      `,
      [restaurant_id, menuItemIds]
    );

    if (menuResult.rows.length !== items.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "One or more menu items are invalid for this restaurant"
      });
    }

    const menuItems = new Map(
      menuResult.rows.map((item) => [String(item.id), item])
    );

    let totalAmount = 0;

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Item quantity must be a positive integer"
        });
      }

      const menuItem = menuItems.get(String(item.menu_item_id));

      if (!menuItem || !menuItem.is_available) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Menu item ${item.menu_item_id} is unavailable`
        });
      }

      totalAmount += Number(menuItem.price) * item.quantity;
    }

    // Create order
    const orderResult = await client.query(
      `
      INSERT INTO orders (
        restaurant_id,
        customer_name,
        customer_address,
        total_amount
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, restaurant_id, customer_name,
                customer_address, total_amount,
                status, created_at, updated_at
      `,
      [
        restaurant_id,
        customer_name,
        customer_address,
        totalAmount
      ]
    );

    const order = orderResult.rows[0];

    // Create order items
    for (const item of items) {
      const menuItem = menuItems.get(String(item.menu_item_id));

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
          item.menu_item_id,
          item.quantity,
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

export async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const orderResult = await pool.query(
      `
      SELECT
        id,
        restaurant_id,
        customer_name,
        customer_address,
        total_amount,
        status,
        created_at,
        updated_at
      FROM orders
      WHERE id = $1
      `,
      [id]
    );

    if (orderResult.rows.length === 0) {
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
      ...orderResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error("Failed to fetch order:", error);

    res.status(500).json({
      error: "Failed to fetch order"
    });
  }
}

export async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "PLACED",
      "CONFIRMED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid order status"
      });
    }

    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        restaurant_id,
        customer_name,
        customer_address,
        total_amount,
        status,
        created_at,
        updated_at
      `,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Order not found"
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

