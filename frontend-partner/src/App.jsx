import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/context";
import { api } from "./services/api";
import Login from "./pages/Login";
import Menu from "./pages/Menu";
import Orders from "./pages/Orders";
import "./App.css";

function OpenToggle() {
  const { restaurant, setRestaurant } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !restaurant.is_open;

    if (!next && !window.confirm("Stop taking new orders? Customers will see the restaurant as closed.")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const data = await api.setOpen(next);
      setRestaurant(data.restaurant);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="open-toggle">
      <button
        type="button"
        className={`open-button ${restaurant.is_open ? "open" : "closed"}`}
        onClick={toggle}
        disabled={saving}
        aria-pressed={restaurant.is_open}
      >
        <span className="dot" />
        {restaurant.is_open ? "Accepting orders" : "Closed for orders"}
      </button>
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}

function Shell({ children, live }) {
  const { user, restaurant, logout } = useAuth();
  const onOrders = useLocation().pathname === "/";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>swiggy <em>partner</em></span>
        </div>

        <div className="restaurant-card">
          <span className="eyebrow">YOUR RESTAURANT</span>
          <strong>{restaurant.name}</strong>
          <span className="subtle">{restaurant.cuisine} · {restaurant.address}</span>
          <OpenToggle />
        </div>

        <nav className="side-nav">
          <NavLink to="/" end>Orders</NavLink>
          <NavLink to="/menu">Menu</NavLink>
        </nav>

        <div className="sidebar-foot">
          {/* The live order stream runs on the Orders page only. */}
          {onOrders && (
            <span className={`live-indicator ${live ? "on" : ""}`}>
              <span className="dot" /> {live ? "Live updates on" : "Reconnecting..."}
            </span>
          )}
          <div className="user-chip">
            <strong>{user.name}</strong>
            <span>{user.role === "OWNER" ? "Owner" : "Staff"}</span>
          </div>
          <button type="button" className="button ghost block" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [live, setLive] = useState(false);

  if (loading) {
    return <p className="notice center">Loading...</p>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell live={live}>
      <Routes>
        <Route path="/" element={<Orders onLiveChange={setLive} />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
