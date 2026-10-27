import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import pool from "../src/db/pool.js";

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
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
});

test("GET /health returns UP", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.status, "UP");
  assert.equal(body.service, "swiggy-devsecops-backend");
});

test("GET /health/db confirms database connectivity", async () => {
  const response = await fetch(`${baseUrl}/health/db`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.status, "UP");
  assert.equal(body.database, "connected");
});

test("GET /api/restaurants returns restaurants", async () => {
  const response = await fetch(`${baseUrl}/api/restaurants`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(body[0].name);
});

test("GET /api/restaurants/:id returns a restaurant", async () => {
  const response = await fetch(`${baseUrl}/api/restaurants/1`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.id, "1");
  assert.equal(body.name, "Spice Garden");
});

test("GET /api/restaurants/:id returns 404 for unknown restaurant", async () => {
  const response = await fetch(`${baseUrl}/api/restaurants/999999`);

  assert.equal(response.status, 404);

  const body = await response.json();

  assert.equal(body.error, "Restaurant not found");
});

test("GET /api/restaurants/:id/menu returns menu items", async () => {
  const response = await fetch(`${baseUrl}/api/restaurants/1/menu`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(body[0].name);
  assert.ok(body[0].price);
});

test("POST /api/orders creates an order", async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      restaurant_id: 1,
      customer_name: "Test Customer",
      customer_address: "Test Address",
      items: [
        {
          menu_item_id: 1,
          quantity: 1
        },
        {
          menu_item_id: 2,
          quantity: 2
        }
      ]
    })
  });

  assert.equal(response.status, 201);

  const body = await response.json();

  assert.equal(body.message, "Order created successfully");
  assert.ok(body.order.id);
  assert.equal(body.order.status, "PLACED");
  assert.equal(body.order.total_amount, "607.00");

  // Store the generated order ID for later tests.
  process.env.TEST_ORDER_ID = body.order.id;
});

test("GET /api/orders/:id returns the created order", async () => {
  const orderId = process.env.TEST_ORDER_ID;

  assert.ok(orderId);

  const response = await fetch(`${baseUrl}/api/orders/${orderId}`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.id, orderId);
  assert.equal(body.customer_name, "Test Customer");
  assert.equal(body.status, "PLACED");
  assert.equal(body.items.length, 2);
});

test("PATCH /api/orders/:id/status updates order status", async () => {
  const orderId = process.env.TEST_ORDER_ID;

  assert.ok(orderId);

  const response = await fetch(
    `${baseUrl}/api/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "CONFIRMED"
      })
    }
  );

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.order.id, orderId);
  assert.equal(body.order.status, "CONFIRMED");
});

test("PATCH /api/orders/:id/status rejects invalid status", async () => {
  const orderId = process.env.TEST_ORDER_ID;

  assert.ok(orderId);

  const response = await fetch(
    `${baseUrl}/api/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "INVALID_STATUS"
      })
    }
  );

  assert.equal(response.status, 400);

  const body = await response.json();

  assert.equal(body.error, "Invalid order status");
});

test.after(async () => {
   await pool.end();
});
