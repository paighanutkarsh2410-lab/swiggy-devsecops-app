import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { api } from "../services/api";
import {
  ORDER_STEPS,
  formatDate,
  formatPrice,
  statusLabel,
} from "../utils/orders";

const REFRESH_INTERVAL_MS = 10000;
const FINISHED_STATUSES = ["DELIVERED", "CANCELLED"];

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const status = order?.status;

  useEffect(() => {
    let cancelled = false;

    function load() {
      api.getOrder(id)
        .then((data) => {
          if (!cancelled) {
            setOrder(data);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();

    const isFinished = FINISHED_STATUSES.includes(status);
    const timer = isFinished ? null : setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [id, status]);

  async function cancelOrder() {
    setCancelling(true);
    setError("");

    try {
      const result = await api.cancelOrder(id);
      setOrder((current) => ({ ...current, ...result.order }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <main className="page-container message">Loading order...</main>;

  if (!order) {
    return (
      <main className="page-container">
        <p className="message error">{error || "Order not found"}</p>
        <Link to="/orders" className="back-link">← My orders</Link>
      </main>
    );
  }

  const currentStep = ORDER_STEPS.indexOf(order.status);
  const isCancelled = order.status === "CANCELLED";
  const canCancel =
    order.status === "PLACED" && String(order.user_id) === String(user?.id);

  return (
    <main className="page-container order-page">
      <Link to="/orders" className="back-link">← My orders</Link>
      <span className="eyebrow">ORDER #{order.id}</span>
      <h1 className="page-title">{statusLabel(order.status)}</h1>
      <p className="muted">Placed {formatDate(order.created_at)}</p>
      {order.ready_by && ["CONFIRMED", "PREPARING"].includes(order.status) && (
        <p className="message success">
          The restaurant expects your food to be ready by {formatDate(order.ready_by)}.
        </p>
      )}

      {isCancelled ? (
        <p className="message error">This order was cancelled.</p>
      ) : (
        <ol className="order-steps">
          {ORDER_STEPS.map((step, index) => (
            <li
              key={step}
              className={index <= currentStep ? "complete" : ""}
              aria-current={index === currentStep ? "step" : undefined}
            >
              <span className="step-dot" aria-hidden="true" />
              {statusLabel(step)}
            </li>
          ))}
        </ol>
      )}

      <section className="order-summary">
        <h2>Order summary</h2>
        {order.items.map((item) => (
          <div className="cart-line" key={item.id}>
            <span>{item.name} × {item.quantity}</span>
            <strong>{formatPrice(Number(item.unit_price) * item.quantity)}</strong>
          </div>
        ))}
        <div className="cart-total">
          <span>Total</span>
          <strong>{formatPrice(order.total_amount)}</strong>
        </div>
        <p className="muted">
          Delivering to {order.customer_name}, {order.customer_address}
        </p>
      </section>

      {error && <p className="message error">{error}</p>}

      {canCancel && (
        <button
          type="button"
          className="secondary-button"
          disabled={cancelling}
          onClick={cancelOrder}
        >
          {cancelling ? "Cancelling..." : "Cancel order"}
        </button>
      )}
    </main>
  );
}
