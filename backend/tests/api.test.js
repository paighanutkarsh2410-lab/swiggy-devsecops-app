import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import pool from "../src/db/pool.js";
import { hashPassword } from "../src/auth/password.js";

const PASSWORD = "test-password-123";
const runId = Date.now();

let server;
let baseUrl;
let customerToken;
let otherCustomerToken;
let staffToken;
let otherStaffToken;
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

  return {
    status: response.status,
    body: await response.json()
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

async function createStaff(label, restaurantId) {
  const email = `${label}-${runId}@example.test`;

  await pool.query(
    `
    INSERT INTO users (name, email, password_hash, role, restaurant_id)
    VALUES ($1, $2, $3, 'STAFF', $4)
    `,
    [`Test ${label}`, email, await hashPassword(PASSWORD), restaurantId]
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

test.before(async () => {
  server = app.listen(0);

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  customerToken = await registerCustomer("customer");
  otherCustomerToken = await registerCustomer("other-customer");
  staffToken = await createStaff("staff", 1);
  otherStaffToken = await createStaff("other-staff", 2);
});

test.after(async () => {
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

test("GET /api/orders/restaurant is limited to the staff member's restaurant", async () => {
  const customer = await api("/api/orders/restaurant", { token: customerToken });
  const staff = await api("/api/orders/restaurant", { token: staffToken });
  const otherStaff = await api("/api/orders/restaurant", {
    token: otherStaffToken
  });

  assert.equal(customer.status, 403);
  assert.equal(staff.status, 200);

  const order = staff.body.find((item) => item.id === orderId);

  assert.deepEqual(order.next_statuses, ["CONFIRMED", "CANCELLED"]);
  assert.ok(!otherStaff.body.some((item) => item.id === orderId));
});

test("PATCH /api/orders/:id/status rejects an unknown status", async () => {
  const { status, body } = await setStatus(orderId, staffToken, "INVALID_STATUS");

  assert.equal(status, 400);
  assert.equal(body.error, "Invalid order status");
});

test("customers cannot move an order forward", async () => {
  const { status } = await setStatus(orderId, customerToken, "CONFIRMED");

  assert.equal(status, 403);
});

test("staff from another restaurant cannot update an order", async () => {
  const { status } = await setStatus(orderId, otherStaffToken, "CONFIRMED");

  assert.equal(status, 404);
});

test("staff can take an order through its full lifecycle", async () => {
  for (const next of ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"]) {
    const { status, body } = await setStatus(orderId, staffToken, next);

    assert.equal(status, 200);
    assert.equal(body.order.status, next);
  }
});

test("a delivered order cannot change status", async () => {
  const { status } = await setStatus(orderId, staffToken, "PREPARING");

  assert.equal(status, 409);
});

test("statuses cannot be skipped", async () => {
  const order = await placeOrder(customerToken);
  const { status } = await setStatus(order.id, staffToken, "DELIVERED");

  assert.equal(status, 409);
});

test("customers can cancel only while an order is PLACED", async () => {
  const placed = await placeOrder(customerToken);
  const cancelled = await setStatus(placed.id, customerToken, "CANCELLED");

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.order.status, "CANCELLED");

  const confirmed = await placeOrder(customerToken);

  await setStatus(confirmed.id, staffToken, "CONFIRMED");

  const tooLate = await setStatus(confirmed.id, customerToken, "CANCELLED");

  assert.equal(tooLate.status, 403);
});
