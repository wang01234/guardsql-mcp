-- GuardSQL MCP - demo e-commerce schema (PostgreSQL 16)
-- A small but realistic transactional schema used by the demo/seed data.
-- Foreign keys are real so describe_table can surface primary/foreign keys.

CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    country     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id           SERIAL PRIMARY KEY,
    sku          TEXT        NOT NULL UNIQUE,
    name         TEXT        NOT NULL,
    category     TEXT        NOT NULL,
    price_cents  INTEGER     NOT NULL CHECK (price_cents >= 0),
    stock        INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id           SERIAL PRIMARY KEY,
    customer_id  INTEGER     NOT NULL REFERENCES customers (id),
    status       TEXT        NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
    total_cents  INTEGER     NOT NULL CHECK (total_cents >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id                SERIAL PRIMARY KEY,
    order_id          INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id        INTEGER NOT NULL REFERENCES products (id),
    qty               INTEGER NOT NULL CHECK (qty > 0),
    unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE payments (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER     NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    provider      TEXT        NOT NULL,
    status        TEXT        NOT NULL CHECK (status IN ('authorized', 'captured', 'failed', 'refunded')),
    amount_cents  INTEGER     NOT NULL CHECK (amount_cents >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_customer_id   ON orders (customer_id);
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_payments_order_id    ON payments (order_id);
