import express from "express";
import cors from "cors";
import helmet from "helmet";
import pool from "./db/pool.js";
import restaurantRoutes from "./routes/restaurantRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);


app.get("/", (req, res) => {
  res.json({
    message: "Swiggy DevSecOps API",
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "swiggy-devsecops-backend"
  });
});

app.get("/health/db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.status(200).json({
      status: "UP",
      database: "connected",
      timestamp: result.rows[0].current_time
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      status: "DOWN",
      database: "unavailable"
    });
  }
});

export default app;
