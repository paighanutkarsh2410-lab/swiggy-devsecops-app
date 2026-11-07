import pool from "../db/pool.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/token.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const UNIQUE_VIOLATION = "23505";

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurant_id: user.restaurant_id
  };
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export async function register(req, res) {
  const { name, password } = req.body ?? {};
  const email = normalizeEmail(req.body?.email);
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!trimmedName || trimmedName.length > 150) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }

  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return res.status(400).json({
      error: `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`
    });
  }

  try {
    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, role, restaurant_id
      `,
      [trimmedName, email, passwordHash]
    );

    const user = result.rows[0];

    res.status(201).json({
      token: signToken(user),
      user: toPublicUser(user)
    });
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: "This email is already registered" });
    }

    console.error("Failed to register user:", error);

    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function login(req, res) {
  const { password } = req.body ?? {};
  const email = normalizeEmail(req.body?.email);

  if (!email || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, name, email, role, restaurant_id, password_hash
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    res.status(200).json({
      token: signToken(user),
      user: toPublicUser(user)
    });
  } catch (error) {
    console.error("Failed to log in:", error);

    res.status(500).json({ error: "Failed to log in" });
  }
}

export function getCurrentUser(req, res) {
  res.status(200).json({ user: toPublicUser(req.user) });
}
