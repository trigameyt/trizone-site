CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    discord_username TEXT NOT NULL,
    discord_global_name TEXT,
    discord_avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    banned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS minecraft_accounts (
    id BIGSERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE REFERENCES users(discord_id) ON DELETE CASCADE,
    minecraft_uuid TEXT NOT NULL UNIQUE,
    minecraft_username TEXT NOT NULL,
    minecraft_rank TEXT NOT NULL DEFAULT 'default',
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_codes (
    code TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    event_created_at TIMESTAMPTZ,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    process_error TEXT,
    processed_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_orders (
    checkout_session_id TEXT PRIMARY KEY,
    event_id TEXT,
    payment_intent_id TEXT,
    discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
    minecraft_uuid TEXT,
    minecraft_username TEXT,
    rank_key TEXT NOT NULL,
    price_id TEXT,
    amount_total BIGINT,
    currency TEXT,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    active BOOLEAN NOT NULL DEFAULT FALSE,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS minecraft_deliveries (
    id BIGSERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
    minecraft_uuid TEXT NOT NULL,
    minecraft_username TEXT NOT NULL,
    target_rank TEXT NOT NULL DEFAULT 'default',
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at ON stripe_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_discord ON stripe_orders(discord_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_payment_intent ON stripe_orders(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_active_rank ON stripe_orders(discord_id, active, rank_key);
CREATE INDEX IF NOT EXISTS idx_minecraft_delivery_pending ON minecraft_deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_minecraft_rank ON minecraft_accounts(minecraft_rank);
