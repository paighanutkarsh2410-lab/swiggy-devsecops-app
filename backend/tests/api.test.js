import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import pool from "../src/db/pool.js";
import { hashPassword } from "../src/auth/password.js";
import { stopOrderEvents } from "../src/events/orderEvents.js";

const PASSWORD = "test-password-123";
const runId = Date.now();

let server;
let baseUrl;
let customerToken;
let otherCustomerToken;
let staffToken;
let otherStaffToken;
let ownerToken;
let orderId;

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function registerCustomer(label) {
  const response = await api("/api/auth/register", {
    method: "POST",
    body: {
      name: `Test ${label}`,
      email: `${label}-${runId}@example.test`,
      password: PASSWORD
    }
  });

  assert.equal(response.status, 201);

  return response.body.token;
}

async function createPartner(label, restaurantId, role = "STAFF") {
  const email = `${label}-${runId}@example.test`;

  await pool.query(
    `
    INSERT INTO users (name, email, password_hash, role, restaurant_id)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [`Test ${label}`, email, await hashPassword(PASSWORD), role, restaurantId]
  );

  const response = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD }
  });

  assert.equal(response.status, 200);

  return response.body.token;
}

function orderBody(items) {
  return {
    restaurant_id: 1,
    customer_name: "Test Customer",
    customer_address: "Test Address",
    items
  };
}

async function placeOrder(token, items = [{ menu_item_id: 1, quantity: 1 }]) {
  const response = await api("/api/orders", {
    method: "POST",
    token,
    body: orderBody(items)
  });

  assert.equal(response.status, 201);

  return response.body.order;
}

function setStatus(id, token, status) {
  return api(`/api/orders/${id}/status`, {
    method: "PATCH",
    token,
    body: { status }
  });
}

// Restaurant-side status change. Accepting an order needs a preparation time.
function partnerStatus(id, token, status, prepMinutes = status === "CONFIRMED" ? 15 : undefined) {
  return api(`/api/partner/orders/${id}/status`, {
    method: "PATCH",
    token,
    body: { status, prep_minutes: prepMinutes }
  });
}

test.before(async () => {
  server = app.listen(0);

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  customerToken = await registerCustomer("customer");
  otherCustomerToken = await registerCustomer("other-customer");
  staffToken = await createPartner("staff", 1);
  otherStaffToken = await createPartner("other-staff", 2);
  ownerToken = await createPartner("owner", 1, "OWNER");
});

test.after(async () => {
  server.closeAllConnections();
  await stopOrderEvents();

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  await pool.end();
});

test("GET /health returns UP", async () => {
  const { status, body } = await api("/health");

  assert.equal(status, 200);
  assert.equal(body.status, "UP");
  assert.equal(body.service, "swiggy-devsecops-backend");
});

test("GET /health/db confirms database connectivity", async () => {
  const { status, body } = await api("/health/db");

  assert.equal(status, 200);
  assert.equal(body.status, "UP");
  assert.equal(body.database, "connected");
});

test("GET /api/restaurants returns restaurants", async () => {
  const { status, body } = await api("/api/restaurants");

  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(body[0].name);
});

test("GET /api/restaurants/:id returns a restaurant", async () => {
  const { status, body } = await api("/api/restaurants/1");

  assert.equal(status, 200);
  assert.equal(body.id, "1");
  assert.equal(body.name, "Spice Garden");
});

test("GET /api/restaurants/:id returns 404 for unknown restaurant", async () => {
  const { status, body } = await api("/api/restaurants/999999");

  assert.equal(status, 404);
  assert.equal(body.error, "Restaurant not found");
});

test("GET /api/restaurants/:id rejects invalid ids", async () => {
  for (const id of ["abc", "0", "-1", "99999999999999999999"]) {
    const { status, body } = await api(`/api/restaurants/${id}`);

    assert.equal(status, 400);
    assert.equal(body.error, "Invalid id");
  }
});

test("GET /api/restaurants/:id/menu returns menu items", async () => {
  const { status, body } = await api("/api/restaurants/1/menu");

  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(body[0].name);
  assert.ok(body[0].price);
});

test("malformed JSON returns a JSON 400", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json"
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Invalid request");
});

test("POST /api/auth/register validates input", async () => {
  const shortPassword = await api("/api/auth/register", {
    method: "POST",
    body: { name: "A", email: `a-${runId}@example.test`, password: "short" }
  });

  assert.equal(shortPassword.status, 400);

  const badEmail = await api("/api/auth/register", {
    method: "POST",
    body: { name: "A", email: "not-an-email", password: PASSWORD }
  });

  assert.equal(badEmail.status, 400);
});

test("POST /api/auth/register rejects a duplicate email", async () => {
  const { status } = await api("/api/auth/register", {
    method: "POST",
    body: {
      name: "Duplicate",
      email: `CUSTOMER-${runId}@example.test`,
      password: PASSWORD
    }
  });

  assert.equal(status, 409);
});

test("POST /api/auth/login rejects a wrong password", async () => {
  const { status, body } = await api("/api/auth/login", {
    method: "POST",
    body: {
      email: `customer-${runId}@example.test`,
      password: "wrong-password"
    }
  });

  assert.equal(status, 401);
  assert.equal(body.error, "Incorrect email or password");
});

test("GET /api/auth/me returns the user without the password hash", async () => {
  const { status, body } = await api("/api/auth/me", { token: customerToken });

  assert.equal(status, 200);
  assert.equal(body.user.email, `customer-${runId}@example.test`);
  assert.equal(body.user.role, "CUSTOMER");
  assert.equal(body.user.password_hash, undefined);
});

test("order routes require a valid token", async () => {
  assert.equal((await api("/api/orders/1")).status, 401);
  assert.equal(
    (await api("/api/orders/1", { token: "not-a-real-token" })).status,
    401
  );
  assert.equal(
    (await api("/api/orders", {
      method: "POST",
      body: orderBody([{ menu_item_id: 1, quantity: 1 }])
    })).status,
    401
  );
});

test("POST /api/orders creates an order", async () => {
  const { status, body } = await api("/api/orders", {
    method: "POST",
    token: customerToken,
    body: orderBody([
      { menu_item_id: 1, quantity: 1 },
      { menu_item_id: 2, quantity: 2 }
    ])
  });

  assert.equal(status, 201);
  assert.equal(body.message, "Order created successfully");
  assert.ok(body.order.id);
  assert.equal(body.order.status, "PLACED");
  assert.equal(body.order.total_amount, "607.00");

  orderId = body.order.id;
});

test("POST /api/orders merges repeated menu items", async () => {
  const order = await placeOrder(customerToken, [
    { menu_item_id: 1, quantity: 1 },
    { menu_item_id: 1, quantity: 2 }
  ]);

  assert.equal(order.total_amount, "747.00");

  const { body } = await api(`/api/orders/${order.id}`, {
    token: customerToken
  });

  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].quantity, 3);
});

test("POST /api/orders rejects invalid input", async () => {
  const cases = [
    [{ menu_item_id: "abc", quantity: 1 }],
    [{ menu_item_id: 1, quantity: 0 }],
    [{ menu_item_id: 1, quantity: 51 }],
    [{ menu_item_id: 4, quantity: 1 }]
  ];

  for (const items of cases) {
    const { status } = await api("/api/orders", {
      method: "POST",
      token: customerToken,
      body: orderBody(items)
    });

    assert.equal(status, 400);
  }
});

test("GET /api/orders/:id returns the customer's own order", async () => {
  const { status, body } = await api(`/api/orders/${orderId}`, {
    token: customerToken
  });

  assert.equal(status, 200);
  assert.equal(body.id, orderId);
  assert.equal(body.customer_name, "Test Customer");
  assert.equal(body.status, "PLACED");
  assert.equal(body.items.length, 2);
});

test("GET /api/orders/:id hides orders from other users", async () => {
  const otherCustomer = await api(`/api/orders/${orderId}`, {
    token: otherCustomerToken
  });
  const otherStaff = await api(`/api/orders/${orderId}`, {
    token: otherStaffToken
  });

  assert.equal(otherCustomer.status, 404);
  assert.equal(otherStaff.status, 404);
});

test("GET /api/orders lists only the customer's orders", async () => {
  const mine = await api("/api/orders", { token: customerToken });
  const theirs = await api("/api/orders", { token: otherCustomerToken });

  assert.equal(mine.status, 200);
  assert.ok(mine.body.some((order) => order.id === orderId));
  assert.ok(!theirs.body.some((order) => order.id === orderId));
  assert.equal(mine.body[0].restaurant_name, "Spice Garden");
});

test("partner routes are closed to customers and anonymous users", async () => {
  for (const path of ["/api/partner/me", "/api/partner/orders", "/api/partner/menu"]) {
    assert.equal((await api(path)).status, 401);
    assert.equal((await api(path, { token: customerToken })).status, 403);
  }
});

test("GET /api/partner/me returns the partner and their restaurant", async () => {
  const staff = await api("/api/partner/me", { token: staffToken });
  const owner = await api("/api/partner/me", { token: ownerToken });

  assert.equal(staff.status, 200);
  assert.equal(staff.body.user.role, "STAFF");
  assert.equal(staff.body.restaurant.name, "Spice Garden");
  assert.equal(owner.body.user.role, "OWNER");
  assert.equal(owner.body.user.password_hash, undefined);
});

test("GET /api/partner/orders is limited to the partner's restaurant", async () => {
  const staff = await api("/api/partner/orders", { token: staffToken });
  const otherStaff = await api("/api/partner/orders", { token: otherStaffToken });

  assert.equal(staff.status, 200);

  const order = staff.body.find((item) => item.id === orderId);

  assert.deepEqual(order.next_statuses, ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(order.items, [
    { name: "Paneer Butter Masala", quantity: 1 },
    { name: "Dal Tadka", quantity: 2 }
  ]);
  assert.ok(!otherStaff.body.some((item) => item.id === orderId));
});

test("the old staff route on the customer API is gone", async () => {
  const { status } = await api("/api/orders/restaurant", { token: staffToken });

  assert.equal(status, 400);
});

test("PATCH /api/partner/orders/:id/status rejects an unknown status", async () => {
  const { status, body } = await partnerStatus(orderId, staffToken, "INVALID_STATUS");

  assert.equal(status, 400);
  assert.equal(body.error, "Invalid order status");
});

test("accepting an order needs a valid preparation time", async () => {
  for (const prep of [undefined, 0, 4, 121, 12.5, "15"]) {
    const { status } = await api(`/api/partner/orders/${orderId}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "CONFIRMED", prep_minutes: prep }
    });

    assert.equal(status, 400, `prep_minutes ${prep} should be rejected`);
  }
});

test("customers cannot move an order forward", async () => {
  const viaCustomerApi = await setStatus(orderId, customerToken, "CONFIRMED");
  const viaPartnerApi = await partnerStatus(orderId, customerToken, "CONFIRMED");

  assert.equal(viaCustomerApi.status, 403);
  assert.equal(viaPartnerApi.status, 403);
});

test("staff cannot change status through the customer API", async () => {
  const { status } = await setStatus(orderId, staffToken, "CONFIRMED");

  assert.equal(status, 403);
});

test("staff from another restaurant cannot update an order", async () => {
  const { status } = await partnerStatus(orderId, otherStaffToken, "CONFIRMED");

  assert.equal(status, 404);
});

test("staff can take an order through its full lifecycle", async () => {
  const accepted = await partnerStatus(orderId, staffToken, "CONFIRMED", 20);

  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.order.status, "CONFIRMED");
  assert.equal(accepted.body.order.prep_minutes, 20);

  const readyIn = new Date(accepted.body.order.ready_by) - Date.now();

  assert.ok(
    readyIn > 19 * 60 * 1000 && readyIn <= 20 * 60 * 1000,
    "ready_by is about 20 minutes away"
  );

  for (const next of ["PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"]) {
    const { status, body } = await partnerStatus(orderId, staffToken, next);

    assert.equal(status, 200);
    assert.equal(body.order.status, next);
  }

  const { body } = await api(`/api/orders/${orderId}`, { token: customerToken });

  assert.equal(body.status, "DELIVERED");
  assert.equal(body.prep_minutes, 20);
});

test("a delivered order cannot change status", async () => {
  const { status } = await partnerStatus(orderId, staffToken, "PREPARING");

  assert.equal(status, 409);
});

test("delivered orders leave the active list but stay in the full list", async () => {
  const active = await api("/api/partner/orders", { token: staffToken });
  const all = await api("/api/partner/orders?scope=all", { token: staffToken });

  assert.ok(!active.body.some((order) => order.id === orderId));
  assert.ok(all.body.some((order) => order.id === orderId));
});

test("statuses cannot be skipped", async () => {
  const order = await placeOrder(customerToken);
  const { status } = await partnerStatus(order.id, staffToken, "DELIVERED");

  assert.equal(status, 409);
});

test("the restaurant can reject a new order", async () => {
  const order = await placeOrder(customerToken);
  const { status, body } = await partnerStatus(order.id, ownerToken, "CANCELLED");

  assert.equal(status, 200);
  assert.equal(body.order.status, "CANCELLED");
});

test("customers can cancel only while an order is PLACED", async () => {
  const placed = await placeOrder(customerToken);
  const cancelled = await setStatus(placed.id, customerToken, "CANCELLED");

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.order.status, "CANCELLED");

  const confirmed = await placeOrder(customerToken);

  await partnerStatus(confirmed.id, staffToken, "CONFIRMED");

  const tooLate = await setStatus(confirmed.id, customerToken, "CANCELLED");

  assert.equal(tooLate.status, 403);
});

test("a closed restaurant does not accept orders", async () => {
  try {
    const closed = await api("/api/partner/restaurant", {
      method: "PATCH",
      token: staffToken,
      body: { is_open: false }
    });

    assert.equal(closed.status, 200);
    assert.equal(closed.body.restaurant.is_open, false);

    const listed = await api("/api/restaurants/1");

    assert.equal(listed.body.is_open, false);

    const order = await api("/api/orders", {
      method: "POST",
      token: customerToken,
      body: orderBody([{ menu_item_id: 1, quantity: 1 }])
    });

    assert.equal(order.status, 409);
  } finally {
    await api("/api/partner/restaurant", {
      method: "PATCH",
      token: staffToken,
      body: { is_open: true }
    });
  }

  assert.equal((await api("/api/restaurants/1")).body.is_open, true);
});

test("PATCH /api/partner/restaurant validates is_open", async () => {
  const { status } = await api("/api/partner/restaurant", {
    method: "PATCH",
    token: ownerToken,
    body: { is_open: "no" }
  });

  assert.equal(status, 400);
});

test("only the owner can add menu items, and input is validated", async () => {
  const item = {
    name: `Test Thali ${runId}`,
    description: "Test item",
    price: 199.5,
    is_veg: true
  };

  const byStaff = await api("/api/partner/menu", {
    method: "POST",
    token: staffToken,
    body: item
  });

  assert.equal(byStaff.status, 403);

  for (const bad of [
    { ...item, name: "" },
    { ...item, price: -1 },
    { ...item, price: 10.999 },
    { ...item, price: "free" },
    { ...item, is_veg: "yes" }
  ]) {
    const { status } = await api("/api/partner/menu", {
      method: "POST",
      token: ownerToken,
      body: bad
    });

    assert.equal(status, 400);
  }

  const created = await api("/api/partner/menu", {
    method: "POST",
    token: ownerToken,
    body: item
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.item.price, "199.50");

  const menu = await api("/api/restaurants/1/menu");

  assert.ok(menu.body.some((row) => row.id === created.body.item.id));
});

test("staff can mark an item sold out but cannot edit it", async () => {
  const { body } = await api("/api/partner/menu", {
    method: "POST",
    token: ownerToken,
    body: { name: `Sold Out Test ${runId}`, price: 99 }
  });
  const itemId = body.item.id;

  const rename = await api(`/api/partner/menu/${itemId}`, {
    method: "PATCH",
    token: staffToken,
    body: { name: "Renamed by staff" }
  });

  assert.equal(rename.status, 403);

  const soldOut = await api(`/api/partner/menu/${itemId}`, {
    method: "PATCH",
    token: staffToken,
    body: { is_available: false }
  });

  assert.equal(soldOut.status, 200);
  assert.equal(soldOut.body.item.is_available, false);

  const customerMenu = await api("/api/restaurants/1/menu");
  const partnerMenu = await api("/api/partner/menu", { token: staffToken });

  assert.ok(!customerMenu.body.some((row) => row.id === itemId));
  assert.ok(partnerMenu.body.some((row) => row.id === itemId));

  const order = await api("/api/orders", {
    method: "POST",
    token: customerToken,
    body: orderBody([{ menu_item_id: Number(itemId), quantity: 1 }])
  });

  assert.equal(order.status, 400);

  const repriced = await api(`/api/partner/menu/${itemId}`, {
    method: "PATCH",
    token: ownerToken,
    body: { price: "120.00", is_available: true }
  });

  assert.equal(repriced.status, 200);
  assert.equal(repriced.body.item.price, "120.00");
});

test("partners cannot change another restaurant's menu", async () => {
  const pizzaMenu = await api("/api/partner/menu", { token: otherStaffToken });
  const pizzaItem = pizzaMenu.body[0];

  const { status } = await api(`/api/partner/menu/${pizzaItem.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { price: 1 }
  });

  assert.equal(status, 404);
});

test("removing an item archives it and keeps past orders intact", async () => {
  const { body } = await api("/api/partner/menu", {
    method: "POST",
    token: ownerToken,
    body: { name: `Archive Test ${runId}`, price: 50 }
  });
  const itemId = body.item.id;
  const order = await placeOrder(customerToken, [
    { menu_item_id: Number(itemId), quantity: 2 }
  ]);

  const byStaff = await api(`/api/partner/menu/${itemId}`, {
    method: "DELETE",
    token: staffToken
  });

  assert.equal(byStaff.status, 403);

  const removed = await api(`/api/partner/menu/${itemId}`, {
    method: "DELETE",
    token: ownerToken
  });

  assert.equal(removed.status, 204);

  const partnerMenu = await api("/api/partner/menu", { token: ownerToken });

  assert.ok(!partnerMenu.body.some((row) => row.id === itemId));

  const pastOrder = await api(`/api/orders/${order.id}`, { token: customerToken });

  assert.equal(pastOrder.body.items[0].name, `Archive Test ${runId}`);

  const again = await api(`/api/partner/menu/${itemId}`, {
    method: "DELETE",
    token: ownerToken
  });

  assert.equal(again.status, 404);
});

// Opens the partner event stream, runs trigger once the stream is ready, and
// returns the first order event that matches, or null after the timeout.
async function waitForEvent(token, matches, trigger, timeoutMs = 5000) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/partner/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let buffer = "";
  let triggered = false;

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) return null;

      buffer += decoder.decode(value, { stream: true });

      let end;

      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);

        buffer = buffer.slice(end + 2);

        const name = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];

        if (name === "ready" && !triggered) {
          triggered = true;
          await trigger();
        }

        if (name === "order") {
          const event = JSON.parse(data);

          if (matches(event)) return event;
        }
      }
    }
  } catch (error) {
    if (error.name === "AbortError") return null;
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test("the partner event stream announces new orders and status changes", async () => {
  let newOrderId;

  const created = await waitForEvent(
    staffToken,
    (event) => event.type === "order_created" && event.order_id === newOrderId,
    async () => {
      newOrderId = (await placeOrder(customerToken)).id;
    }
  );

  assert.ok(created, "order_created event received");
  assert.equal(created.restaurant_id, "1");
  assert.equal(created.status, "PLACED");

  const updated = await waitForEvent(
    staffToken,
    (event) => event.type === "order_updated" && event.order_id === newOrderId,
    () => partnerStatus(newOrderId, staffToken, "CONFIRMED")
  );

  assert.ok(updated, "order_updated event received");
  assert.equal(updated.status, "CONFIRMED");
});

test("the event stream only carries the partner's own restaurant", async () => {
  let newOrderId;

  const leaked = await waitForEvent(
    otherStaffToken,
    (event) => event.order_id === newOrderId,
    async () => {
      newOrderId = (await placeOrder(customerToken)).id;
    },
    1500
  );

  assert.equal(leaked, null);
});

async function metricsText() {
  const response = await fetch(`${baseUrl}/metrics`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/plain/);

  return response.text();
}

function metricValue(text, name, labels) {
  const line = text
    .split("\n")
    .find((row) => row.startsWith(`${name}{`) && labels.every((label) => row.includes(label)));

  return line ? Number(line.split(" ").pop()) : 0;
}

test("GET /metrics serves Prometheus metrics with route patterns, not raw URLs", async () => {
  await api("/api/restaurants/1");
  await api("/api/restaurants/2/menu");

  const text = await metricsText();

  assert.match(text, /swiggy_process_cpu_seconds_total/);
  assert.match(text, /swiggy_http_request_duration_seconds_bucket\{/);
  assert.match(text, /route="\/api\/restaurants\/:id"/);
  assert.match(text, /route="\/api\/restaurants\/:id\/menu"/);
  assert.doesNotMatch(text, /route="\/api\/restaurants\/1"/);
  assert.match(text, /app="swiggy-backend"/);
});

test("order metrics count new orders and status changes", async () => {
  const before = await metricsText();
  const order = await placeOrder(customerToken);

  await partnerStatus(order.id, staffToken, "CONFIRMED");

  const after = await metricsText();

  assert.equal(
    metricValue(after, "swiggy_orders_created_total", ['restaurant_id="1"']) -
      metricValue(before, "swiggy_orders_created_total", ['restaurant_id="1"']),
    1
  );
  assert.equal(
    metricValue(after, "swiggy_order_status_changes_total", ['status="CONFIRMED"', 'actor="partner"']) -
      metricValue(before, "swiggy_order_status_changes_total", ['status="CONFIRMED"', 'actor="partner"']),
    1
  );
});

test("metrics are not served under /api, so the websites never expose them", async () => {
  const response = await fetch(`${baseUrl}/api/metrics`);

  assert.equal(response.status, 404);
});

test("requests rejected before a route matches are labelled with their router", async () => {
  // Rejected by the login check inside the orders router, before /:id matches.
  assert.equal((await api("/api/orders/123")).status, 401);
  // Handled by the router's own "/" route.
  assert.equal((await api("/api/restaurants")).status, 200);

  const text = await metricsText();

  assert.match(text, /route="\/api\/orders\/\*",status_code="401"/);
  assert.match(text, /route="\/api\/restaurants",status_code="200"/);
  assert.doesNotMatch(text, /route="\/api\/restaurants\/"/);
});
