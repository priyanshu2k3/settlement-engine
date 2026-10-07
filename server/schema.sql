CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallets (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance_cents INT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0)
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    product_id BIGINT NOT NULL REFERENCES products (id),
    status TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders (id),
    wallet_id BIGINT NOT NULL REFERENCES wallets (user_id),
    amount_cents INT NOT NULL,
    entry_type TEXT NOT NULL
);

CREATE INDEX orders_user_id_idx ON orders (user_id);
CREATE INDEX orders_product_id_idx ON orders (product_id);
CREATE INDEX ledger_entries_order_id_idx ON ledger_entries (order_id);
CREATE INDEX ledger_entries_wallet_id_idx ON ledger_entries (wallet_id);
