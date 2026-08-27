SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  discord_id VARCHAR(32) PRIMARY KEY,
  discord_username VARCHAR(100) NOT NULL,
  discord_global_name VARCHAR(100) NULL,
  discord_avatar VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  banned BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minecraft_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(32) NOT NULL UNIQUE,
  minecraft_uuid VARCHAR(64) NOT NULL UNIQUE,
  minecraft_username VARCHAR(32) NOT NULL,
  minecraft_rank VARCHAR(32) NOT NULL DEFAULT 'default',
  linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_minecraft_accounts_user FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE,
  INDEX idx_minecraft_rank (minecraft_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS link_codes (
  code VARCHAR(128) PRIMARY KEY,
  discord_id VARCHAR(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_link_codes_user FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE,
  INDEX idx_link_codes_discord (discord_id),
  INDEX idx_link_codes_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(120) NOT NULL,
  event_created_at DATETIME(3) NULL,
  data JSON NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  process_error TEXT NULL,
  processed_at DATETIME(3) NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_stripe_events_type (type),
  INDEX idx_stripe_events_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stripe_orders (
  checkout_session_id VARCHAR(255) PRIMARY KEY,
  event_id VARCHAR(255) NULL,
  payment_intent_id VARCHAR(255) NULL,
  discord_id VARCHAR(32) NOT NULL,
  minecraft_uuid VARCHAR(64) NULL,
  minecraft_username VARCHAR(32) NULL,
  rank_key VARCHAR(64) NOT NULL,
  price_id VARCHAR(255) NULL,
  amount_total BIGINT NULL,
  currency VARCHAR(16) NULL,
  payment_status VARCHAR(32) NOT NULL DEFAULT 'unpaid',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_stripe_orders_user FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE,
  INDEX idx_stripe_orders_discord (discord_id, purchased_at),
  INDEX idx_stripe_orders_payment_intent (payment_intent_id),
  INDEX idx_stripe_orders_active_rank (discord_id, active, rank_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minecraft_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(32) NOT NULL,
  minecraft_uuid VARCHAR(64) NOT NULL,
  minecraft_username VARCHAR(32) NOT NULL,
  target_rank VARCHAR(64) NOT NULL DEFAULT 'default',
  reason VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  last_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_minecraft_deliveries_user FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE,
  INDEX idx_minecraft_delivery_pending (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_kits (
  kit_key VARCHAR(64) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  icon_material VARCHAR(80) NOT NULL DEFAULT 'IRON_SWORD',
  emoji VARCHAR(32) NOT NULL DEFAULT '⚔',
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_duel_kits_active_order (active, sort_order, display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_player_stats (
  minecraft_uuid VARCHAR(64) NOT NULL,
  minecraft_username VARCHAR(32) NOT NULL,
  kit_key VARCHAR(64) NOT NULL,
  elo INT NOT NULL DEFAULT 300,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  kills INT NOT NULL DEFAULT 0,
  deaths INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (minecraft_uuid, kit_key),
  CONSTRAINT fk_duel_player_stats_kit FOREIGN KEY (kit_key) REFERENCES duel_kits(kit_key) ON DELETE CASCADE,
  INDEX idx_duel_stats_kit_elo (kit_key, elo, wins),
  INDEX idx_duel_stats_username (minecraft_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_elo_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  minecraft_uuid VARCHAR(64) NOT NULL,
  minecraft_username VARCHAR(32) NOT NULL,
  kit_key VARCHAR(64) NOT NULL,
  elo INT NOT NULL DEFAULT 300,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  games INT NOT NULL DEFAULT 0,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_duel_history_player_kit (minecraft_uuid, kit_key, recorded_at),
  INDEX idx_duel_history_username (minecraft_username, kit_key, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_player_settings (
  minecraft_uuid VARCHAR(64) PRIMARY KEY,
  minecraft_username VARCHAR(32) NULL,
  selected_kit VARCHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_duel_player_settings_kit FOREIGN KEY (selected_kit) REFERENCES duel_kits(kit_key) ON DELETE SET NULL,
  INDEX idx_duel_settings_selected (selected_kit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_sync_files (
  file_key VARCHAR(120) PRIMARY KEY,
  content LONGTEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  source_server VARCHAR(80) NOT NULL DEFAULT 'Lobby',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialise un premier point pour les joueurs déjà présents avant l'ajout des graphes.
INSERT INTO duel_elo_history(minecraft_uuid,minecraft_username,kit_key,elo,wins,losses,games,recorded_at)
SELECT s.minecraft_uuid,s.minecraft_username,s.kit_key,s.elo,s.wins,s.losses,(s.wins+s.losses),COALESCE(s.updated_at,NOW())
FROM duel_player_stats s
WHERE NOT EXISTS (
  SELECT 1 FROM duel_elo_history h
  WHERE h.minecraft_uuid=s.minecraft_uuid AND h.kit_key=s.kit_key
);

CREATE TABLE IF NOT EXISTS minecraft_game_data (
  minecraft_uuid VARCHAR(64) PRIMARY KEY,
  minecraft_username VARCHAR(32) NOT NULL,
  source_server VARCHAR(64) NOT NULL DEFAULT 'Lobby',
  inventory JSON NOT NULL,
  armor JSON NOT NULL,
  offhand JSON NULL,
  ender_chest JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_game_data_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  `key` VARCHAR(120) PRIMARY KEY,
  `value` TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tables prêtes pour la prochaine étape de centralisation des tournois.
-- Le transport temps réel reste volontairement Velocity/FullSync afin d'éviter du polling MySQL.
CREATE TABLE IF NOT EXISTS duel_tournaments (
  tournament_id VARCHAR(96) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'registration',
  format_key VARCHAR(32) NOT NULL DEFAULT 'single_elimination',
  kit_mode VARCHAR(32) NULL,
  winner_uuid VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_tournament_state (state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duel_matches (
  match_id VARCHAR(96) PRIMARY KEY,
  tournament_id VARCHAR(96) NULL,
  round_no INT NULL,
  player1_uuid VARCHAR(64) NULL,
  player2_uuid VARCHAR(64) NULL,
  winner_uuid VARCHAR(64) NULL,
  kit_key VARCHAR(64) NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'pending',
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_duel_matches_tournament FOREIGN KEY (tournament_id) REFERENCES duel_tournaments(tournament_id) ON DELETE CASCADE,
  INDEX idx_duel_matches_tournament (tournament_id, round_no, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO site_settings(`key`, `value`) VALUES
  ('announcement', 'Bienvenue sur Trizone.'),
  ('home_title', 'TRIZONE'),
  ('home_description', 'Trizone est un réseau Minecraft Java & Bedrock centré sur la survie et le PvP : progression par grades, warzone, duels, événements et systèmes communautaires. Connecte ton Discord, lie ton compte Minecraft et retrouve ton profil ainsi que la boutique au même endroit.'),
  ('server_address', 'play.trizone.club'),
  ('server_tagline', 'Survie • PvP • Duels • Événements • Java & Bedrock'),
  ('feature_1_title', 'Survie & progression'),
  ('feature_1_text', 'Développe ton stuff, progresse dans les grades et profite des systèmes d’économie et de progression du serveur.'),
  ('feature_2_title', 'PvP & duels'),
  ('feature_2_text', 'Warzone, entraînement PvP et duels pour se battre, tester ses kits et progresser face aux autres joueurs.'),
  ('feature_3_title', 'Java & Bedrock'),
  ('feature_3_text', 'Le réseau est accessible aux joueurs Java et Bedrock grâce à Geyser et Floodgate.'),
  ('discord_invite_url', ''),
  ('legal_operator_name', ''),
  ('legal_contact_address', ''),
  ('legal_contact_email', ''),
  ('privacy_contact_email', ''),
  ('legal_extra_terms', '');
