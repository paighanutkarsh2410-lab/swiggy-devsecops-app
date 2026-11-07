import express from "express";

import {
  createOrder,
  getMyOrders,
  getOrderById,
  getRestaurantOrders,
  updateOrderStatus
} from "../controllers/orderController.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { validateIdParam } from "../middleware/validateId.js";

const router = express.Router();

router.param("id", validateIdParam);

router.use(requireAuth);

router.get("/", getMyOrders);
router.post("/", createOrder);
router.get("/restaurant", requireStaff, getRestaurantOrders);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);

export default router;
