import express from "express";

import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus
} from "../controllers/orderController.js";
import { requireAuth } from "../middleware/auth.js";
import { validateIdParam } from "../middleware/validateId.js";

const router = express.Router();

router.param("id", validateIdParam);

router.use(requireAuth);

router.get("/", getMyOrders);
router.post("/", createOrder);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);

export default router;
