const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "swiggy_partner_token";

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

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data;
}

export const api = {
  login: (credentials) => request("/auth/login", { method: "POST", body: credentials }),

  me: () => request("/partner/me"),

  setOpen: (isOpen) =>
    request("/partner/restaurant", { method: "PATCH", body: { is_open: isOpen } }),

  getOrders: (scope = "active") => request(`/partner/orders?scope=${scope}`),

  setOrderStatus: (id, status, prepMinutes) =>
    request(`/partner/orders/${id}/status`, {
      method: "PATCH",
      body: { status, prep_minutes: prepMinutes },
    }),

  getMenu: () => request("/partner/menu"),

  createMenuItem: (item) => request("/partner/menu", { method: "POST", body: item }),

  updateMenuItem: (id, changes) =>
    request(`/partner/menu/${id}`, { method: "PATCH", body: changes }),

  removeMenuItem: (id) => request(`/partner/menu/${id}`, { method: "DELETE" }),
};

// Listens to the live order stream. EventSource cannot send an
// Authorization header, so this reads the Server-Sent Events stream with
// fetch instead. It reconnects after a drop and reports whether it is live.
export function listenToOrderEvents({ onEvent, onStatusChange }) {
  let stopped = false;
  let controller = null;
  let retryTimer = null;
  let retryDelay = 1000;

  async function connect() {
    if (stopped) return;

    controller = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/partner/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Event stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let end;

        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);

          buffer = buffer.slice(end + 2);

          const name = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];

          if (name === "ready") {
            retryDelay = 1000;
            onStatusChange(true);
          } else if (name === "order" && data) {
            onEvent(JSON.parse(data));
          }
        }
      }
    } catch {
      // Dropped or refused; retry below unless stopped.
    }

    if (stopped) return;

    onStatusChange(false);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
  };
}
