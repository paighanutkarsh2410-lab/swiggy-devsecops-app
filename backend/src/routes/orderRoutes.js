import express from "express";

import {
  createOrder,
  getOrderById,
  updateOrderStatus
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/", createOrder);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);

export default router;
