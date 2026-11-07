import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// An idle connection can be dropped, for example when PostgreSQL restarts.
// Without this handler the error is unhandled and crashes the whole API.
pool.on("error", (error) => {
  console.error("Idle database connection error:", error.message);
});

export default pool;
