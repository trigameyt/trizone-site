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


CREATE TABLE IF NOT EXISTS duel_kits (
    kit_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, icon_material TEXT NOT NULL DEFAULT 'IRON_SWORD',
    emoji TEXT NOT NULL DEFAULT '⚔', sort_order INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS duel_player_stats (
    minecraft_uuid TEXT NOT NULL, minecraft_username TEXT NOT NULL, kit_key TEXT NOT NULL REFERENCES duel_kits(kit_key) ON DELETE CASCADE,
    elo INTEGER NOT NULL DEFAULT 300, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (minecraft_uuid, kit_key)
);
CREATE TABLE IF NOT EXISTS duel_player_settings (minecraft_uuid TEXT PRIMARY KEY, minecraft_username TEXT, selected_kit TEXT REFERENCES duel_kits(kit_key) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS minecraft_game_data (
    minecraft_uuid TEXT PRIMARY KEY, minecraft_username TEXT NOT NULL, source_server TEXT NOT NULL DEFAULT 'Lobby', inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
    armor JSONB NOT NULL DEFAULT '[]'::jsonb, offhand JSONB, ender_chest JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_duel_stats_kit_elo ON duel_player_stats(kit_key, elo DESC, wins DESC);
CREATE INDEX IF NOT EXISTS idx_duel_stats_username ON duel_player_stats(LOWER(minecraft_username));
