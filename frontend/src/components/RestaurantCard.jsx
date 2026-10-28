
import { Link } from "react-router-dom";

export default function RestaurantCard({ restaurant }) {
  return (
    <Link
      to={`/restaurant/${restaurant.id}`}
      className="restaurant-card"
    >
      <div className="restaurant-art">
        <span>{restaurant.cuisine === "Italian" ? "🍕" : "🍛"}</span>
        <span className="delivery-badge">
          {restaurant.delivery_time_minutes} min
        </span>
      </div>

      <div className="restaurant-details">
        <h3>{restaurant.name}</h3>
        <div className="restaurant-meta">
          <span>★ {restaurant.rating}</span>
          <span>{restaurant.cuisine}</span>
        </div>
        <p>{restaurant.description}</p>
        <span className="view-menu">Explore menu →</span>
      </div>
    </Link>
  );
}

