// Creates or updates a restaurant staff account.
// Usage: set STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD and STAFF_RESTAURANT_ID,
// then run: node src/scripts/createStaff.js
import pool from "../db/pool.js";
import { hashPassword } from "../auth/password.js";

const { STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD, STAFF_RESTAURANT_ID } = process.env;

if (!STAFF_NAME || !STAFF_EMAIL || !STAFF_PASSWORD || !STAFF_RESTAURANT_ID) {
  console.error(
    "Set STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD and STAFF_RESTAURANT_ID"
  );
  process.exit(1);
}

if (STAFF_PASSWORD.length < 8) {
  console.error("STAFF_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const passwordHash = await hashPassword(STAFF_PASSWORD);

const result = await pool.query(
  `
  INSERT INTO users (name, email, password_hash, role, restaurant_id)
  VALUES ($1, $2, $3, 'STAFF', $4)
  ON CONFLICT (email) DO UPDATE
  SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'STAFF',
    restaurant_id = EXCLUDED.restaurant_id
  RETURNING id, email, restaurant_id
  `,
  [STAFF_NAME, STAFF_EMAIL.trim().toLowerCase(), passwordHash, STAFF_RESTAURANT_ID]
);

console.log("Staff account ready:", result.rows[0]);

await pool.end();
