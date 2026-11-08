// Which status an order may move to next. Shared by the customer and partner APIs.
export const NEXT_STATUSES = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: []
};

export const ACTIVE_STATUSES = ["PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];

export const ORDER_COLUMNS = `
  id,
  user_id,
  restaurant_id,
  customer_name,
  customer_address,
  total_amount,
  status,
  prep_minutes,
  ready_by,
  created_at,
  updated_at
`;

export function isKnownStatus(status) {
  return typeof status === "string" && Object.hasOwn(NEXT_STATUSES, status);
}

export function canMove(from, to) {
  return NEXT_STATUSES[from]?.includes(to) ?? false;
}
