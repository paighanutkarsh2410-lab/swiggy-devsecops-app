
import { useEffect, useMemo, useState } from "react";
import RestaurantCard from "../components/RestaurantCard";
import { api } from "../services/api";

export default function Home() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
  const [cuisine, setCuisine] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getRestaurants()
      .then(setRestaurants)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cuisines = ["All", ...new Set(restaurants.map((r) => r.cuisine))];

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();

    return restaurants.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(term) ||
        r.cuisine.toLowerCase().includes(term) ||
        (r.description || "").toLowerCase().includes(term);

      return (
        matchesSearch &&
        (cuisine === "All" || r.cuisine === cuisine)
      );
    });
  }, [restaurants, search, cuisine]);

  return (
    <main className="page-container">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">GOOD FOOD. GOOD MOOD.</span>
          <h1>Your next favourite meal is just a few clicks away.</h1>
          <p>Discover delicious food from restaurants around Nagpur.</p>
          <a href="#restaurants" className="primary-button">
            Explore restaurants ↓
          </a>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <span>🍔</span>
          <span>🍕</span>
          <span>🥗</span>
          <span>🍜</span>
        </div>
      </section>

      <section id="restaurants" className="restaurants-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MADE FOR YOUR CRAVINGS</span>
            <h2>Restaurants near you</h2>
          </div>
          <span className="result-count">
            {filtered.length} places
          </span>
        </div>

        <input
          className="search-input"
          type="search"
          placeholder="Search restaurants or cuisines..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search restaurants"
        />

        <div className="filter-row">
          {cuisines.map((item) => (
            <button
              key={item}
              className={`filter-chip ${cuisine === item ? "active" : ""}`}
              onClick={() => setCuisine(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        {loading && <p className="message">Finding delicious food...</p>}
        {error && <p className="message error">{error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <p className="message">No restaurants found. Try another search.</p>
        )}

        {!loading && !error && (
          <div className="restaurant-grid">
            {filtered.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

