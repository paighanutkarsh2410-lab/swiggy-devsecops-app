-- Adds accounts to a database created before login existed.
-- New databases already get this from init.sql.
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
        CHECK (role IN ('CUSTOMER', 'STAFF')),
    restaurant_id BIGINT REFERENCES restaurants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((role = 'STAFF') = (restaurant_id IS NOT NULL))
);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON orders(user_id);
