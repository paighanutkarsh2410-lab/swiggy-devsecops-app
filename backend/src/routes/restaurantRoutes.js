import express from "express";
import {
  getRestaurants,
  getRestaurantById,
  getRestaurantMenu
} from "../controllers/restaurantController.js";
import { validateIdParam } from "../middleware/validateId.js";

const router = express.Router();

router.param("id", validateIdParam);

router.get("/", getRestaurants);
router.get("/:id", getRestaurantById);
router.get("/:id/menu", getRestaurantMenu);

export default router;
