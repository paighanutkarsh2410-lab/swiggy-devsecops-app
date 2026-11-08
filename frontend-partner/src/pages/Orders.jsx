import { useCallback, useEffect, useRef, useState } from "react";
import OrderCard from "../components/OrderCard";
import { api, listenToOrderEvents } from "../services/api";
import { formatPrice, formatTime, statusLabel } from "../utils/format";

const COLUMNS = [
  { status: "PLACED", title: "New", empty: "No new orders" },
  { status: "CONFIRMED", title: "Accepted", empty: "Nothing waiting to start" },
  { status: "PREPARING", title: "Preparing", empty: "Kitchen is clear" },
  { status: "OUT_FOR_DELIVERY", title: "Out for delivery", empty: "No orders on the road" },
];

// Used only when the live stream is down.
const FALLBACK_REFRESH_MS = 30000;
const CLOCK_TICK_MS = 30000;
const NEW_ORDER_HIGHLIGHT_MS = 8000;

export default function Orders({ onLiveChange }) {
  const [scope, setScope] = useState("active");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [live, setLive] = useState(false);
  const [newIds, setNewIds] = useState(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const reloadTimer = useRef(null);

  const load = useCallback(
    () =>
      api.getOrders(scope)
        .then((data) => {
          setOrders(data);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    [scope]
  );

  // The live stream stays connected across tab changes and always reloads
  // with the current tab's loader.
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);

    return () => clearInterval(timer);
  }, []);

  // Live updates: reload when the server announces a change.
  useEffect(() => {
    const stop = listenToOrderEvents({
      onStatusChange: (isLive) => {
        setLive(isLive);
        onLiveChange?.(isLive);
        // Catch up on anything missed while disconnected.
        if (isLive) loadRef.current();
      },
      onEvent: (event) => {
        if (event.type === "order_created") {
          setNewIds((ids) => new Set(ids).add(event.order_id));
          setTimeout(() => {
            setNewIds((ids) => {
              const next = new Set(ids);
              next.delete(event.order_id);
              return next;
            });
          }, NEW_ORDER_HIGHLIGHT_MS);
        }

        // Several events in quick succession cause one reload.
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => loadRef.current(), 250);
      },
    });

    return () => {
      stop();
      clearTimeout(reloadTimer.current);
      onLiveChange?.(false);
    };
  }, [onLiveChange]);

  useEffect(() => {
    if (live) return undefined;

    const timer = setInterval(load, FALLBACK_REFRESH_MS);

    return () => clearInterval(timer);
  }, [live, load]);

  async function changeStatus(order, status, prepMinutes) {
    setBusyId(order.id);
    setError("");

    try {
      await api.setOrderStatus(order.id, status, prepMinutes);
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const counts = Object.fromEntries(
    COLUMNS.map(({ status }) => [status, orders.filter((o) => o.status === status).length])
  );

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">ORDERS</span>
          <h1>{scope === "active" ? "Live orders" : "Order history"}</h1>
        </div>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "active"}
            className={scope === "active" ? "active" : ""}
            onClick={() => { setLoading(true); setScope("active"); }}
          >
            Live
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            className={scope === "all" ? "active" : ""}
            onClick={() => { setLoading(true); setScope("all"); }}
          >
            History
          </button>
        </div>
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}
      {loading && <p className="notice">Loading orders...</p>}

      {!loading && scope === "active" && (
        <div className="board">
          {COLUMNS.map((column) => (
            <div className="board-column" key={column.status}>
              <h2>
                {column.title}
                <span className="count">{counts[column.status]}</span>
              </h2>
              {orders
                .filter((order) => order.status === column.status)
                .sort((a, b) => Number(a.id) - Number(b.id))
                .map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    busy={busyId === order.id}
                    isNew={newIds.has(order.id)}
                    onChangeStatus={changeStatus}
                  />
                ))}
              {counts[column.status] === 0 && <p className="column-empty">{column.empty}</p>}
            </div>
          ))}
        </div>
      )}

      {!loading && scope === "all" && (
        <div className="history">
          {orders.length === 0 && <p className="notice">No orders yet.</p>}
          {orders.map((order) => (
            <div className="history-row" key={order.id}>
              <strong>#{order.id}</strong>
              <span>{formatTime(order.created_at)}</span>
              <span className="history-customer">{order.customer_name}</span>
              <span className="history-items">
                {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
              </span>
              <strong>{formatPrice(order.total_amount)}</strong>
              <span className={`status-pill status-${order.status.toLowerCase()}`}>
                {statusLabel(order.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
