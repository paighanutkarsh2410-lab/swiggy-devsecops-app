const STATUS_LABELS = {
  PLACED: "New",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

// What the button that moves an order to this status says.
const ACTION_LABELS = {
  PREPARING: "Start preparing",
  OUT_FOR_DELIVERY: "Hand to rider",
  DELIVERED: "Mark delivered",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function actionLabel(status) {
  return ACTION_LABELS[status] ?? statusLabel(status);
}

export function formatPrice(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function minutesSince(value, now) {
  return Math.max(0, Math.floor((now - new Date(value)) / 60000));
}

// "just now", "12 min ago", "3 h ago", "12 days ago".
export function timeAgo(value, now) {
  const minutes = minutesSince(value, now);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;

  const days = Math.floor(minutes / (24 * 60));

  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function minutesUntil(value, now) {
  return Math.round((new Date(value) - now) / 60000);
}
