const { Pool } = require('pg');

const sslEnabled = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL manquant dans les variables d’environnement.');
  }

  await query(`
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
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS link_codes (
      code TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tebex_events (
      webhook_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      event_date TIMESTAMPTZ,
      subject JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO site_settings(key, value)
    VALUES ('announcement', 'Bienvenue sur Trizone !')
    ON CONFLICT (key) DO NOTHING;

    CREATE INDEX IF NOT EXISTS idx_tebex_events_type ON tebex_events(type);
    CREATE INDEX IF NOT EXISTS idx_tebex_events_received_at ON tebex_events(received_at DESC);
  `);
}

module.exports = { pool, query, initDatabase };
