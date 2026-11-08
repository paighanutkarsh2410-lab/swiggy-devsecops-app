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

export function minutesUntil(value, now) {
  return Math.ceil((new Date(value) - now) / 60000);
}
