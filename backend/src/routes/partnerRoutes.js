import express from "express";

import {
  archiveMenuItem,
  createMenuItem,
  getPartnerProfile,
  listMenu,
  listOrders,
  streamOrderEvents,
  updateMenuItem,
  updateOrderStatus,
  updateRestaurant
} from "../controllers/partnerController.js";
import { requireAuth, requireOwner, requirePartner } from "../middleware/auth.js";
import { validateIdParam } from "../middleware/validateId.js";

const router = express.Router();

router.param("id", validateIdParam);

router.use(requireAuth, requirePartner);

router.get("/me", getPartnerProfile);
router.patch("/restaurant", updateRestaurant);

router.get("/orders", listOrders);
router.patch("/orders/:id/status", updateOrderStatus);
router.get("/events", streamOrderEvents);

router.get("/menu", listMenu);
router.post("/menu", requireOwner, createMenuItem);
router.patch("/menu/:id", updateMenuItem);
router.delete("/menu/:id", requireOwner, archiveMenuItem);

export default router;
