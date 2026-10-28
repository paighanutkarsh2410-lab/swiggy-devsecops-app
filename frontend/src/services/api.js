
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }

  return data;
}

export const api = {
  getRestaurants: () => request("/restaurants"),

  getRestaurant: (id) => request(`/restaurants/${id}`),

  getMenu: (id) => request(`/restaurants/${id}/menu`),

  createOrder: (order) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(order),
    }),
};

