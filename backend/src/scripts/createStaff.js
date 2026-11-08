// Creates or updates a restaurant partner account for the partner console.
// Usage: set STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD and STAFF_RESTAURANT_ID,
// and optionally STAFF_ROLE=OWNER (the default is STAFF), then run:
//   node src/scripts/createStaff.js
import pool from "../db/pool.js";
import { hashPassword } from "../auth/password.js";

const { STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD, STAFF_RESTAURANT_ID } = process.env;
const STAFF_ROLE = (process.env.STAFF_ROLE || "STAFF").toUpperCase();

if (!STAFF_NAME || !STAFF_EMAIL || !STAFF_PASSWORD || !STAFF_RESTAURANT_ID) {
  console.error(
    "Set STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD and STAFF_RESTAURANT_ID"
  );
  process.exit(1);
}

if (!["STAFF", "OWNER"].includes(STAFF_ROLE)) {
  console.error("STAFF_ROLE must be STAFF or OWNER");
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
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (email) DO UPDATE
  SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    restaurant_id = EXCLUDED.restaurant_id
  RETURNING id, email, role, restaurant_id
  `,
  [
    STAFF_NAME,
    STAFF_EMAIL.trim().toLowerCase(),
    passwordHash,
    STAFF_ROLE,
    STAFF_RESTAURANT_ID
  ]
);

console.log("Partner account ready:", result.rows[0]);

await pool.end();
