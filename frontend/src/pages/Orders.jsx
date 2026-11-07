import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { formatDate, formatPrice, statusLabel } from "../utils/orders";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyOrders()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-container">
      <span className="eyebrow">YOUR HISTORY</span>
      <h1 className="page-title">My orders</h1>

      {loading && <p className="message">Loading your orders...</p>}
      {error && <p className="message error">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="message">
          You have no orders yet. <Link to="/" className="view-menu">Find something to eat</Link>
        </p>
      )}

      <div className="order-list">
        {orders.map((order) => (
          <Link to={`/orders/${order.id}`} className="order-row" key={order.id}>
            <div>
              <h3>{order.restaurant_name}</h3>
              <p className="muted">Order #{order.id} · {formatDate(order.created_at)}</p>
            </div>
            <div className="order-row-side">
              <strong>{formatPrice(order.total_amount)}</strong>
              <span className={`status-pill status-${order.status.toLowerCase()}`}>
                {statusLabel(order.status)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
