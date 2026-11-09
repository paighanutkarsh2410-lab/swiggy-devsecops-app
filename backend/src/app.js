import express from "express";
import cors from "cors";
import helmet from "helmet";
import pool from "./db/pool.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import authRoutes from "./routes/authRoutes.js";
import restaurantRoutes from "./routes/restaurantRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import partnerRoutes from "./routes/partnerRoutes.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Requests arrive through one Nginx proxy.
app.set("trust proxy", 1);

app.use(metricsMiddleware);
app.use(helmet());
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
app.use(express.json({ limit: "100kb" }));

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/partner", partnerRoutes);


app.get("/", (req, res) => {
  res.json({
    message: "Swiggy DevSecOps API",
    version: "1.0.0"
  });
});

// Prometheus metrics. Outside /api, so the websites' Nginx never serves it.
app.get("/metrics", metricsHandler);

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

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: "Invalid request" });
  }

  console.error("Unhandled request error:", error);

  res.status(500).json({ error: "Internal server error" });
});

export default app;
