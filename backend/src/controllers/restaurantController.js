import pool from "../db/pool.js";

export async function getRestaurants(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        address,
        cuisine,
        rating,
        delivery_time_minutes,
        is_active,
        created_at
      FROM restaurants
      WHERE is_active = TRUE
      ORDER BY id
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Failed to fetch restaurants:", error);

    res.status(500).json({
      error: "Failed to fetch restaurants"
    });
  }
}

export async function getRestaurantById(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        address,
        cuisine,
        rating,
        delivery_time_minutes,
        is_active,
        created_at
      FROM restaurants
      WHERE id = $1
        AND is_active = TRUE
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch restaurant:", error);

    res.status(500).json({
      error: "Failed to fetch restaurant"
    });
  }
}

export async function getRestaurantMenu(req, res) {
  try {
    const { id } = req.params;

    const restaurant = await pool.query(
      `
      SELECT id
      FROM restaurants
      WHERE id = $1
        AND is_active = TRUE
      `,
      [id]
    );

    if (restaurant.rows.length === 0) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price,
        is_veg,
        is_available
      FROM menu_items
      WHERE restaurant_id = $1
        AND is_available = TRUE
      ORDER BY id
      `,
      [id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Failed to fetch restaurant menu:", error);

    res.status(500).json({
      error: "Failed to fetch restaurant menu"
    });
  }
}
