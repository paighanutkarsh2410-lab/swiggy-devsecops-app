import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { formatDate, formatPrice, statusLabel } from "../utils/orders";

const REFRESH_INTERVAL_MS = 15000;

export default function StaffDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const load = useCallback(
    () =>
      api.getRestaurantOrders()
        .then((data) => {
          setOrders(data);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();

    const timer = setInterval(load, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [load]);

  async function updateStatus(orderId, status) {
    setUpdatingId(orderId);

    try {
      await api.updateOrderStatus(orderId, status);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="page-container">
      <span className="eyebrow">RESTAURANT DASHBOARD</span>
      <h1 className="page-title">Incoming orders</h1>

      {loading && <p className="message">Loading orders...</p>}
      {error && <p className="message error">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="message">No orders yet.</p>
      )}

      <div className="order-list">
        {orders.map((order) => (
          <article className="order-row" key={order.id}>
            <div>
              <h3><Link to={`/orders/${order.id}`}>Order #{order.id}</Link></h3>
              <p className="muted">
                {order.customer_name} · {order.customer_address}
                <br />
                {formatDate(order.created_at)}
              </p>
            </div>
            <div className="order-row-side">
              <strong>{formatPrice(order.total_amount)}</strong>
              <span className={`status-pill status-${order.status.toLowerCase()}`}>
                {statusLabel(order.status)}
              </span>
              <div className="order-actions">
                {order.next_statuses.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={next === "CANCELLED" ? "secondary-button" : "primary-button"}
                    disabled={updatingId === order.id}
                    onClick={() => updateStatus(order.id, next)}
                  >
                    {next === "CANCELLED" ? "Reject" : `Mark ${statusLabel(next).toLowerCase()}`}
                  </button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
