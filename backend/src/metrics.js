// Prometheus metrics, served at GET /metrics.
//
// /metrics sits outside /api, so neither website's Nginx proxies it: it is
// only reachable inside the cluster, where a network policy lets Prometheus in.
import client from "prom-client";

export const registry = new client.Registry();

registry.setDefaultLabels({ service: "swiggy-backend" });

// CPU, memory, event loop lag, garbage collection and so on.
client.collectDefaultMetrics({ register: registry, prefix: "swiggy_" });

export const httpRequestDuration = new client.Histogram({
  name: "swiggy_http_request_duration_seconds",
  help: "API request duration in seconds, by method, route and status code",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry]
});

export const ordersCreated = new client.Counter({
  name: "swiggy_orders_created_total",
  help: "Orders placed by customers",
  labelNames: ["restaurant_id"],
  registers: [registry]
});

export const orderStatusChanges = new client.Counter({
  name: "swiggy_order_status_changes_total",
  help: "Order status changes, by new status and who made them",
  labelNames: ["status", "actor"],
  registers: [registry]
});

export const partnerEventStreams = new client.Gauge({
  name: "swiggy_partner_event_streams",
  help: "Partner consoles currently connected to the live order stream",
  registers: [registry]
});

// Records how long each request took. The route label is the Express route
// pattern, such as /api/orders/:id, never the raw URL, so the number of
// label values stays small however many orders exist.
export function metricsMiddleware(req, res, next) {
  // The live event stream stays open for hours; it is counted by the gauge
  // above instead of skewing the latency histogram.
  if (req.path === "/metrics" || req.path === "/api/partner/events") {
    return next();
  }

  const stop = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched";

    stop({ method: req.method, route, status_code: String(res.statusCode) });
  });

  next();
}

export async function metricsHandler(req, res) {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}
