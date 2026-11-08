-- Adds what the partner console needs to a database created before it existed.
-- New databases already get this from init.sql. Safe to run more than once.

ALTER TABLE restaurants
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS prep_minutes INTEGER CHECK (prep_minutes BETWEEN 5 AND 120),
    ADD COLUMN IF NOT EXISTS ready_by TIMESTAMPTZ;

-- Older databases have unnamed checks that PostgreSQL called users_role_check
-- and users_check. Replace them with named checks that allow OWNER.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check,
    DROP CONSTRAINT IF EXISTS users_check,
    DROP CONSTRAINT IF EXISTS users_restaurant_role_check;

ALTER TABLE users
    ADD CONSTRAINT users_role_check
        CHECK (role IN ('CUSTOMER', 'STAFF', 'OWNER')),
    ADD CONSTRAINT users_restaurant_role_check
        CHECK ((role IN ('STAFF', 'OWNER')) = (restaurant_id IS NOT NULL));

CREATE OR REPLACE FUNCTION notify_order_event() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify(
        'order_events',
        json_build_object(
            'type', CASE WHEN TG_OP = 'INSERT' THEN 'order_created' ELSE 'order_updated' END,
            'order_id', NEW.id::text,
            'restaurant_id', NEW.restaurant_id::text,
            'status', NEW.status
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_notify_event ON orders;

CREATE TRIGGER orders_notify_event
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_order_event();
