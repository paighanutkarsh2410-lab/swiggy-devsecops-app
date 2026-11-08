import { useState } from "react";
import {
  actionLabel,
  formatPrice,
  formatTime,
  minutesUntil,
  statusLabel,
  timeAgo,
} from "../utils/format";

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

function ReadyBy({ order, now }) {
  if (!order.ready_by || !["CONFIRMED", "PREPARING"].includes(order.status)) {
    return null;
  }

  const minutes = minutesUntil(order.ready_by, now);

  return (
    <p className={`ready-by ${minutes < 0 ? "late" : ""}`}>
      {minutes >= 0
        ? `Ready in ${minutes} min · by ${formatTime(order.ready_by)}`
        : `Running ${-minutes} min late`}
    </p>
  );
}

export default function OrderCard({ order, now, busy, isNew, onChangeStatus }) {
  const [prepMinutes, setPrepMinutes] = useState(20);
  const forward = order.next_statuses.filter((status) => status !== "CANCELLED");
  const canCancel = order.next_statuses.includes("CANCELLED");

  function cancel() {
    const verb = order.status === "PLACED" ? "Reject" : "Cancel";

    if (window.confirm(`${verb} order #${order.id}? The customer will see it as cancelled.`)) {
      onChangeStatus(order, "CANCELLED");
    }
  }

  return (
    <article className={`order-card status-${order.status.toLowerCase()} ${isNew ? "is-new" : ""}`}>
      <header className="order-card-head">
        <h3>#{order.id}</h3>
        <span className="order-age">
          {formatTime(order.created_at)} · {timeAgo(order.created_at, now)}
        </span>
      </header>

      <p className="order-customer">
        <strong>{order.customer_name}</strong>
        <span>{order.customer_address}</span>
      </p>

      <ul className="order-items">
        {order.items.map((item, index) => (
          <li key={index}>
            <span className="qty">{item.quantity} ×</span> {item.name}
          </li>
        ))}
      </ul>

      <div className="order-total">
        <span>Total</span>
        <strong>{formatPrice(order.total_amount)}</strong>
      </div>

      <ReadyBy order={order} now={now} />

      {order.status === "PLACED" && (
        <div className="order-actions">
          <label className="prep-select">
            Ready in
            <select
              value={prepMinutes}
              onChange={(event) => setPrepMinutes(Number(event.target.value))}
              disabled={busy}
            >
              {PREP_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} min</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => onChangeStatus(order, "CONFIRMED", prepMinutes)}
          >
            Accept
          </button>
          <button type="button" className="button ghost danger" disabled={busy} onClick={cancel}>
            Reject
          </button>
        </div>
      )}

      {order.status !== "PLACED" && (forward.length > 0 || canCancel) && (
        <div className="order-actions">
          {forward.map((status) => (
            <button
              key={status}
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => onChangeStatus(order, status)}
            >
              {actionLabel(status)}
            </button>
          ))}
          {canCancel && (
            <button type="button" className="button ghost danger" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      )}

      {forward.length === 0 && !canCancel && (
        <span className={`status-pill status-${order.status.toLowerCase()}`}>
          {statusLabel(order.status)}
        </span>
      )}
    </article>
  );
}
