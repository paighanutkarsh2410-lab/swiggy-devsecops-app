
const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "swiggy_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the session lasts until the page is closed.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

async function request(path, options = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }

  return data;
}

function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

export const api = {
  getRestaurants: () => request("/restaurants"),

  getRestaurant: (id) => request(`/restaurants/${id}`),

  getMenu: (id) => request(`/restaurants/${id}/menu`),

  register: (details) => post("/auth/register", details),

  login: (credentials) => post("/auth/login", credentials),

  me: () => request("/auth/me"),

  createOrder: (order) => post("/orders", order),

  getMyOrders: () => request("/orders"),

  getOrder: (id) => request(`/orders/${id}`),

  // Customers can only cancel their own order before the restaurant accepts it.
  cancelOrder: (id) =>
    request(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" }),
    }),
};
