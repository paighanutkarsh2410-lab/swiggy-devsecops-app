import express from "express";
import {
  getRestaurants,
  getRestaurantById,
  getRestaurantMenu
} from "../controllers/restaurantController.js";

const router = express.Router();

router.get("/", getRestaurants);
router.get("/:id", getRestaurantById);
router.get("/:id/menu", getRestaurantMenu);

export default router;
