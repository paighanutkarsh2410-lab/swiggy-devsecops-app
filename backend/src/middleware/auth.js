import pool from "../db/pool.js";
import { verifyToken } from "../auth/token.js";

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload;

  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const result = await pool.query(
    `
    SELECT id, name, email, role, restaurant_id
    FROM users
    WHERE id = $1
    `,
    [payload.sub]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = result.rows[0];
  next();
}

export const PARTNER_ROLES = ["OWNER", "STAFF"];

export function isPartner(user) {
  return PARTNER_ROLES.includes(user.role) && user.restaurant_id != null;
}

// Restaurant owners and staff, for the partner console.
export function requirePartner(req, res, next) {
  if (!isPartner(req.user)) {
    return res.status(403).json({ error: "Restaurant partner access required" });
  }

  next();
}

export function requireOwner(req, res, next) {
  if (req.user.role !== "OWNER") {
    return res.status(403).json({ error: "Only the restaurant owner can do this" });
  }

  next();
}
