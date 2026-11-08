// Relays PostgreSQL order_events notifications to subscribers in this process.
//
// The database trigger announces every new order and status change. Each API
// replica keeps one listening connection, so a partner console connected to
// any replica hears about orders written through any other replica.
import { EventEmitter } from "node:events";
import pg from "pg";

const CHANNEL = "order_events";
const RECONNECT_DELAY_MS = 3000;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let client = null;
let starting = null;
let stopped = false;
let reconnectTimer = null;

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start().catch(() => {});
  }, RECONNECT_DELAY_MS);
}

async function start() {
  if (client || stopped) return;
  if (starting) return starting;

  starting = (async () => {
    const next = new pg.Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: 5000
    });

    // A dropped connection, for example during a database restart, must not
    // crash the API. Reconnect and keep relaying events.
    next.on("error", (error) => {
      console.error("Order event listener error:", error.message);
    });

    next.on("end", () => {
      if (client === next) client = null;
      scheduleReconnect();
    });

    next.on("notification", (message) => {
      if (message.channel !== CHANNEL) return;

      try {
        const event = JSON.parse(message.payload);
        emitter.emit(`restaurant:${event.restaurant_id}`, event);
      } catch (error) {
        console.error("Ignoring malformed order event:", error.message);
      }
    });

    try {
      await next.connect();
      await next.query(`LISTEN ${CHANNEL}`);
      client = next;
    } catch (error) {
      console.error("Could not start order event listener:", error.message);
      await next.end().catch(() => {});
      scheduleReconnect();
      throw error;
    }
  })();

  try {
    await starting;
  } finally {
    starting = null;
  }
}

// Calls listener(event) for every order event at one restaurant.
// Returns a function that stops listening.
export async function subscribeToRestaurant(restaurantId, listener) {
  stopped = false;
  const key = `restaurant:${restaurantId}`;

  emitter.on(key, listener);

  try {
    await start();
  } catch {
    // start() keeps retrying in the background.
  }

  return () => emitter.off(key, listener);
}

export function isListening() {
  return client !== null;
}

export async function stopOrderEvents() {
  stopped = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const current = client;
  client = null;

  if (current) await current.end().catch(() => {});
}
