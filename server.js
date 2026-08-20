require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const WebSocket = require('ws');
const { rateLimit } = require('express-rate-limit');
const { pool, query, initDatabase } = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const SITE_SETTINGS = {
  announcement: { max: 500, fallback: 'Bienvenue sur Trizone.' },
  home_title: { max: 80, fallback: 'TRIZONE' },
  home_description: {
    max: 650,
    fallback: 'Trizone est un réseau Minecraft Java & Bedrock centré sur la survie et le PvP : progression par grades, warzone, duels, événements et systèmes communautaires. Connecte ton Discord, lie ton compte Minecraft et retrouve ton profil ainsi que la boutique au même endroit.'
  },
  server_address: { max: 120, fallback: 'play.trizone.club' },
  server_tagline: { max: 180, fallback: 'Survie • PvP • Duels • Événements • Java & Bedrock' },
  feature_1_title: { max: 80, fallback: 'Survie & progression' },
  feature_1_text: { max: 350, fallback: 'Développe ton stuff, progresse dans les grades et profite des systèmes d’économie et de progression du serveur.' },
  feature_2_title: { max: 80, fallback: 'PvP & duels' },
  feature_2_text: { max: 350, fallback: 'Warzone, entraînement PvP et duels pour se battre, tester ses kits et progresser face aux autres joueurs.' },
  feature_3_title: { max: 80, fallback: 'Java & Bedrock' },
  feature_3_text: { max: 350, fallback: 'Le réseau est accessible aux joueurs Java et Bedrock grâce à Geyser et Floodgate.' },
  discord_invite_url: { max: 300, fallback: '' },
  status_title: { max: 80, fallback: 'État des serveurs Minecraft' },
  status_description: { max: 220, fallback: 'Disponibilité du proxy et des serveurs Trizone sur les 60 dernières minutes.' },
  legal_operator_name: { max: 160, fallback: '' },
  legal_contact_address: { max: 350, fallback: '' },
  legal_contact_email: { max: 180, fallback: '' },
  privacy_contact_email: { max: 180, fallback: '' },
  legal_extra_terms: { max: 2500, fallback: '' },
};

const calagopusCache = new Map();

// 60 points x 60 secondes = 60 minutes.
// L'historique est gardé en mémoire et repart à zéro après un redéploiement Render.
const STATUS_HISTORY_SIZE = 60;
const STATUS_SAMPLE_INTERVAL_MS = 60_000;
const statusHistory = new Map();
let lastStatusSampleAt = 0;
let statusSamplePromise = null;
let latestStatusBoard = null;

function pushStatusSample(id, state) {
  const safeState = ['up', 'warn', 'down'].includes(state) ? state : 'down';
  let history = statusHistory.get(id);
  // Au premier échantillon on remplit la fenêtre avec l'état actuel afin d'éviter
  // d'afficher artificiellement 1,67 % juste après un redéploiement.
  if (!history) history = Array(STATUS_HISTORY_SIZE - 1).fill(safeState);
  history.push(safeState);
  if (history.length > STATUS_HISTORY_SIZE) history = history.slice(-STATUS_HISTORY_SIZE);
  statusHistory.set(id, history);
  return history;
}

function uptimePercent(history) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  const available = history.filter((state) => state === 'up' || state === 'warn').length;
  return Math.round((available / history.length) * 10000) / 100;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} j ${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function calagopusConfig(kind = 'status') {
  const panelUrl = String(process.env.CALAGOPUS_PANEL_URL || '').trim().replace(/\/$/, '');
  const statusKey = String(process.env.CALAGOPUS_STATUS_API_KEY || '').trim();
  const adminKey = String(process.env.CALAGOPUS_ADMIN_API_KEY || '').trim();
  return {
    panelUrl,
    apiKey: kind === 'admin' ? adminKey : (statusKey || adminKey),
  };
}

function minecraftServerConfigs() {
  return [
    {
      id: 'proxy',
      label: 'Proxy',
      serverId: String(process.env.CALAGOPUS_PROXY_ID || '').trim(),
      description: 'Point d’entrée Velocity du réseau Trizone.',
    },
    {
      id: 'warzone',
      label: 'Warzone',
      serverId: String(process.env.CALAGOPUS_WARZONE_ID || '').trim(),
      description: 'Serveur PvP / Warzone.',
    },
    {
      id: 'spawn',
      label: 'Spawn',
      serverId: String(process.env.CALAGOPUS_SPAWN_ID || '').trim(),
      description: 'Lobby et spawn principal.',
    },
    {
      id: 'minigame',
      label: 'Minigame',
      serverId: String(process.env.CALAGOPUS_MINIGAME_ID || '').trim(),
      description: 'Serveur de mini-jeux.',
    },
    {
      id: 'auth',
      label: 'Auth',
      serverId: String(process.env.CALAGOPUS_AUTH_ID || '').trim(),
      description: 'Serveur d’authentification.',
    },
  ];
}

function findMinecraftServer(id) {
  return minecraftServerConfigs().find((server) => server.id === String(id || '').toLowerCase()) || null;
}

function calagopusHeaders(apiKey, json = false) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function apiAttributes(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.attributes && typeof payload.attributes === 'object') return payload.attributes;
  if (payload.data?.attributes && typeof payload.data.attributes === 'object') return payload.data.attributes;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return payload.data;
  return payload;
}

async function calagopusRequest(pathname, { kind = 'status', method = 'GET', body, timeout = 7000 } = {}) {
  const cfg = calagopusConfig(kind);
  if (!cfg.panelUrl || !cfg.apiKey) {
    const error = new Error(`Calagopus ${kind} non configuré dans Render.`);
    error.code = 'CALAGOPUS_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${cfg.panelUrl}${pathname}`, {
    method,
    headers: calagopusHeaders(cfg.apiKey, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text.slice(0, 1000) }; }
  }

  if (!response.ok) {
    const message = data?.errors?.[0]?.detail || data?.error || data?.message || `HTTP ${response.status}`;
    const error = new Error(`Calagopus ${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readCalagopusStatus(serverId, label = 'Serveur', { kind = 'status', noCache = false } = {}) {
  if (!serverId) return { configured: false, label };
  const cfg = calagopusConfig(kind);
  if (!cfg.panelUrl || !cfg.apiKey) return { configured: false, label };

  const cacheKey = `${kind}:${serverId}`;
  const now = Date.now();
  const cached = calagopusCache.get(cacheKey);
  if (!noCache && cached && now - cached.at < 10_000) return cached.data;

  const id = encodeURIComponent(serverId);
  const [resourceResult, serverResult] = await Promise.allSettled([
    calagopusRequest(`/api/client/servers/${id}/resources`, { kind }),
    calagopusRequest(`/api/client/servers/${id}`, { kind }),
  ]);

  if (resourceResult.status === 'rejected') throw resourceResult.reason;

  // Calagopus n'utilise pas exactement l'ancien format Pterodactyl.
  // /resources renvoie principalement un objet `resources` dont `state` fait
  // partie des ressources elles-mêmes. On accepte aussi l'ancien format afin
  // de rester compatible avec les installations/proxys qui le transforment.
  const attr = apiAttributes(resourceResult.value);
  const rawServerAttr = serverResult.status === 'fulfilled' ? apiAttributes(serverResult.value) : {};
  const serverAttr = rawServerAttr.server && typeof rawServerAttr.server === 'object'
    ? rawServerAttr.server
    : rawServerAttr;
  const resources = attr.resources && typeof attr.resources === 'object'
    ? attr.resources
    : (attr.utilization && typeof attr.utilization === 'object' ? attr.utilization : attr);
  const network = resources.network && typeof resources.network === 'object' ? resources.network : {};
  const limits = serverAttr.limits || serverAttr.resources?.limits || {};
  const memoryLimitMb = Number(limits.memory || limits.memory_mb || 0);
  const explicitMemoryLimitBytes = Number(resources.memory_limit_bytes ?? attr.memory_limit_bytes ?? 0);

  const rawState =
    resources.current_state ?? resources.state ?? resources.status ??
    attr.current_state ?? attr.state ?? attr.status ??
    serverAttr.current_state ?? serverAttr.state ?? serverAttr.status ??
    'unknown';

  const data = {
    configured: true,
    available: true,
    label,
    state: String(rawState),
    suspended: Boolean(
      resources.is_suspended ?? attr.is_suspended ??
      serverAttr.is_suspended ?? serverAttr.suspended ?? false
    ),
    uptime_ms: Number(resources.uptime ?? attr.uptime ?? 0),
    cpu_percent: Number(resources.cpu_absolute ?? resources.cpu_percent ?? attr.cpu_absolute ?? 0),
    memory_bytes: Number(resources.memory_bytes ?? resources.memory ?? attr.memory_bytes ?? 0),
    memory_limit_bytes: explicitMemoryLimitBytes > 0
      ? explicitMemoryLimitBytes
      : (memoryLimitMb > 0 ? memoryLimitMb * 1024 * 1024 : 0),
    disk_bytes: Number(resources.disk_bytes ?? resources.disk ?? attr.disk_bytes ?? 0),
    network_rx_bytes: Number(
      resources.network_rx_bytes ?? resources.network_rx ??
      network.rx_bytes ?? network.rx ?? attr.network_rx_bytes ?? 0
    ),
    network_tx_bytes: Number(
      resources.network_tx_bytes ?? resources.network_tx ??
      network.tx_bytes ?? network.tx ?? attr.network_tx_bytes ?? 0
    ),
    updated_at: new Date().toISOString(),
  };

  calagopusCache.set(cacheKey, { at: now, data });
  return data;
}

function stateFromCalagopus(status, options = {}) {
  if (!status?.configured) return { state: 'warn', label: 'À configurer' };
  if (!status?.available || status?.suspended) {
    return { state: 'down', label: status?.suspended ? 'Suspendu' : 'Hors ligne' };
  }
  const current = String(status.state || '').toLowerCase();
  if (current === 'running' || current === 'online') return { state: 'up', label: 'En ligne' };
  if (current === 'starting') {
    if (options.treatStartingAsOnline) return { state: 'up', label: 'En ligne' };
    return { state: 'warn', label: 'Démarrage' };
  }
  if (current === 'stopping') return { state: 'warn', label: 'Arrêt en cours' };
  if (current === 'installing' || current === 'restoring_backup') return { state: 'warn', label: 'Maintenance' };
  return { state: 'down', label: 'Hors ligne' };
}

async function sampleCalagopusStatuses() {
  if (statusSamplePromise) return statusSamplePromise;
  statusSamplePromise = (async () => {
    const now = new Date().toISOString();
    const services = [];

    for (const server of minecraftServerConfigs()) {
      let state = 'warn';
      let stateLabel = 'À configurer';
      let meta = 'Ajoute son ID Calagopus dans Render';

      try {
        const status = await readCalagopusStatus(server.serverId, server.label, { noCache: true });
        const mapped = stateFromCalagopus(status, { treatStartingAsOnline: server.id === 'proxy' });
        state = mapped.state;
        stateLabel = mapped.label;
        if (status.configured) meta = `Uptime ${formatDuration(status.uptime_ms)}`;
      } catch (error) {
        state = 'down';
        stateLabel = 'Indisponible';
        meta = 'Impossible de joindre Calagopus';
        console.warn(`[status-board] ${server.id}:`, error.message);
      }

      const history = pushStatusSample(`mc-${server.id}`, state);
      services.push({
        id: server.id,
        name: server.label,
        description: server.description,
        state,
        state_label: stateLabel,
        uptime_percent: uptimePercent(history),
        configured: Boolean(server.serverId),
        history,
        meta,
      });
    }

    latestStatusBoard = { window_minutes: 60, updated_at: now, services };
    lastStatusSampleAt = Date.now();
    return latestStatusBoard;
  })().finally(() => { statusSamplePromise = null; });
  return statusSamplePromise;
}

async function getFreshStatusBoard() {
  if (!latestStatusBoard || Date.now() - lastStatusSampleAt >= STATUS_SAMPLE_INTERVAL_MS) {
    return sampleCalagopusStatuses();
  }
  return latestStatusBoard;
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://files.stripe.com', 'https://*.stripe.com', 'https://assets.mcasset.cloud'],
      styleSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));

app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  next();
});

const SESSION_SECRET = String(process.env.SESSION_SECRET || '');
if (Buffer.byteLength(SESSION_SECRET, 'utf8') < 32) {
  console.error('[security] SESSION_SECRET manquant ou trop court (32 octets minimum). Arrêt du serveur.');
  process.exit(1);
}

app.use(cookieSession({
  name: 'trizone_session',
  keys: [SESSION_SECRET],
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 14,
}));

const sensitiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 35,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// Synchronisations serveur -> site. Authentifiees par X-Trizone-Secret et volontairement
// plus larges : un Lobby peut synchroniser beaucoup de joueurs dans la meme minute.
const minecraftSyncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

const PAID_RANK_ORDER = ['default_plus', 'vip', 'vip_plus', 'hero', 'emperor'];

function paidRankConfig() {
  return PAID_RANK_ORDER.map((key, index) => {
    const envKey = key.toUpperCase();
    // Compatibilité : le dernier grade a été nommé Emperor puis Imperator.
    // On accepte les deux noms de variable Render sans changer la clé interne
    // `emperor`, afin de ne pas casser les commandes/livraisons déjà enregistrées.
    const priceId = key === 'emperor'
      ? (process.env.STRIPE_PRICE_EMPEROR_ID || process.env.STRIPE_PRICE_IMPERATOR_ID || '')
      : (process.env[`STRIPE_PRICE_${envKey}_ID`] || '');
    const roleId = key === 'emperor'
      ? (process.env.DISCORD_ROLE_EMPEROR_ID || process.env.DISCORD_ROLE_IMPERATOR_ID || '')
      : (process.env[`DISCORD_ROLE_${envKey}_ID`] || '');

    return {
      key,
      priority: index + 1,
      priceId: String(priceId).trim(),
      roleId: String(roleId).trim(),
    };
  });
}

function paidRankByKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return paidRankConfig().find((rank) => rank.key === normalized) || null;
}

function paidRankByPriceId(priceId) {
  const id = String(priceId || '').trim();
  if (!id) return null;
  return paidRankConfig().find((rank) => rank.priceId && rank.priceId === id) || null;
}

function discordBotConfig() {
  return {
    token: String(process.env.DISCORD_BOT_TOKEN || '').trim(),
    guildId: String(process.env.DISCORD_GUILD_ID || '').trim(),
  };
}

function validDiscordSnowflake(value) {
  return /^\d{15,22}$/.test(String(value || '').trim());
}

async function discordRoleRequest(method, discordId, roleId) {
  const cfg = discordBotConfig();
  if (!cfg.token || !validDiscordSnowflake(cfg.guildId)) {
    throw new Error('Trizone-bot non configuré dans Render (DISCORD_BOT_TOKEN / DISCORD_GUILD_ID).');
  }
  if (!validDiscordSnowflake(discordId) || !validDiscordSnowflake(roleId)) {
    throw new Error('Discord ID ou Role ID invalide.');
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${cfg.guildId}/members/${discordId}/roles/${roleId}`,
    {
      method,
      headers: {
        Authorization: `Bot ${cfg.token}`,
        'X-Audit-Log-Reason': encodeURIComponent('Synchronisation grade boutique Stripe - Trizone'),
      },
      signal: AbortSignal.timeout(7000),
    }
  );

  // Le joueur n'est pas encore sur le Discord. On garde son achat actif en base
  // et il pourra resynchroniser plus tard depuis son compte Trizone.
  if (response.status === 404) return { ok: false, notMember: true };
  if (response.ok) return { ok: true, notMember: false };

  const body = (await response.text().catch(() => '')).slice(0, 500);
  throw new Error(`Discord API ${response.status}${body ? `: ${body}` : ''}`);
}

async function highestActivePaidRank(discordId) {
  const result = await query(
    `SELECT rank_key
     FROM stripe_orders
     WHERE discord_id = $1 AND active = TRUE`,
    [discordId]
  );
  const active = new Set(result.rows.map((row) => String(row.rank_key || '').toLowerCase()));
  return paidRankConfig()
    .filter((rank) => active.has(rank.key))
    .sort((a, b) => b.priority - a.priority)[0] || null;
}

async function syncDiscordPaidRank(discordId) {
  if (!validDiscordSnowflake(discordId)) return { synced: false, reason: 'invalid_discord_id' };

  const ranks = paidRankConfig().filter((rank) => validDiscordSnowflake(rank.roleId));
  if (!ranks.length) return { synced: false, reason: 'no_roles_configured' };

  const target = await highestActivePaidRank(discordId);
  if (target && !validDiscordSnowflake(target.roleId)) {
    return { synced: false, reason: 'target_role_not_configured', target: target.key };
  }

  // Trizone-bot ne touche qu'aux cinq rôles de grades payants configurés ici.
  // Les rôles staff / membre / autres restent intacts.
  for (const rank of ranks) {
    if (target && rank.key === target.key) continue;
    const removed = await discordRoleRequest('DELETE', discordId, rank.roleId);
    if (removed.notMember) return { synced: false, reason: 'not_member', target: target?.key || null };
  }

  if (target) {
    const added = await discordRoleRequest('PUT', discordId, target.roleId);
    if (added.notMember) return { synced: false, reason: 'not_member', target: target.key };
  }

  return { synced: true, rank: target?.key || null };
}

function stripeConfig() {
  return {
    secretKey: String(process.env.STRIPE_SECRET_KEY || '').trim(),
    webhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
    apiVersion: String(process.env.STRIPE_API_VERSION || '2025-03-31.basil').trim(),
  };
}

async function stripeApi(method, endpoint, form = null) {
  const { secretKey, apiVersion } = stripeConfig();
  if (!secretKey || !secretKey.startsWith('sk_')) throw new Error('STRIPE_SECRET_KEY non configurée.');

  const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
      'Stripe-Version': apiVersion,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? form.toString() : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `Stripe API HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.stripe = json?.error || null;
    throw error;
  }
  return json;
}

function parseStripeSignatureHeader(header) {
  const values = {};
  for (const part of String(header || '').split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (!values[key]) values[key] = [];
    values[key].push(value);
  }
  return values;
}

function verifyStripeWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!Buffer.isBuffer(rawBody)) return false;
  if (!secret || !signatureHeader) return false;
  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed.t?.[0]);
  const signatures = parsed.v1 || [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return signatures.some((signature) => safeEqualHex(expected, signature));
}

function stripeObjectId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.id || '');
  return '';
}

async function enqueueMinecraftRankSync(discordId, reason = 'shop_sync') {
  const account = await query(
    `SELECT discord_id, minecraft_uuid, minecraft_username
     FROM minecraft_accounts WHERE discord_id = $1`,
    [discordId]
  );
  if (!account.rowCount) return { queued: false, reason: 'minecraft_not_linked' };

  const target = await highestActivePaidRank(discordId);
  const row = account.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM minecraft_deliveries
       WHERE discord_id = $1 AND status = 'pending'`,
      [discordId]
    );
    const inserted = await client.query(
      `INSERT INTO minecraft_deliveries(
         discord_id, minecraft_uuid, minecraft_username, target_rank, reason, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING id`,
      [discordId, row.minecraft_uuid, row.minecraft_username, target?.key || 'default', reason]
    );
    await client.query('COMMIT');
    return { queued: true, id: inserted.rows[0].id, rank: target?.key || 'default' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function syncAllPaidRankTargets(discordId, reason) {
  const [discord, minecraft] = await Promise.allSettled([
    syncDiscordPaidRank(discordId),
    enqueueMinecraftRankSync(discordId, reason),
  ]);
  if (discord.status === 'rejected') console.warn('[Stripe Discord sync]', discord.reason?.message || discord.reason);
  if (minecraft.status === 'rejected') console.warn('[Stripe Minecraft sync]', minecraft.reason?.message || minecraft.reason);
  return {
    discord: discord.status === 'fulfilled' ? discord.value : { synced: false, reason: 'error' },
    minecraft: minecraft.status === 'fulfilled' ? minecraft.value : { queued: false, reason: 'error' },
  };
}

async function upsertStripeCheckout(session, eventId, active) {
  const metadata = session?.metadata || {};
  const rankKey = String(metadata.trizone_rank || '').toLowerCase();
  const rank = paidRankByKey(rankKey);
  const discordId = String(metadata.trizone_discord_id || session?.client_reference_id || '').trim();
  const minecraftUuid = String(metadata.trizone_minecraft_uuid || '').trim();
  const minecraftUsername = String(metadata.trizone_minecraft_username || '').trim();
  const priceId = String(metadata.trizone_price_id || rank?.priceId || '').trim();

  if (!rank) throw new Error(`Checkout Stripe ${session?.id || ''}: grade Trizone invalide.`);
  if (!validDiscordSnowflake(discordId)) throw new Error(`Checkout Stripe ${session?.id || ''}: Discord ID invalide.`);
  if (priceId && paidRankByPriceId(priceId)?.key !== rank.key) throw new Error('Le Price ID Stripe ne correspond pas au grade signé dans la session.');

  const existingUser = await query('SELECT discord_id FROM users WHERE discord_id = $1', [discordId]);
  if (!existingUser.rowCount) throw new Error('Le compte Discord du paiement n’existe plus sur Trizone.');

  const paymentIntentId = stripeObjectId(session?.payment_intent);
  const purchasedAt = Number.isFinite(Number(session?.created)) ? new Date(Number(session.created) * 1000) : new Date();
  const paymentStatus = String(session?.payment_status || (active ? 'paid' : 'unpaid'));

  await query(
    `INSERT INTO stripe_orders(
       checkout_session_id, event_id, payment_intent_id, discord_id,
       minecraft_uuid, minecraft_username, rank_key, price_id,
       amount_total, currency, payment_status, active, purchased_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (checkout_session_id) DO UPDATE SET
       event_id = EXCLUDED.event_id,
       payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, stripe_orders.payment_intent_id),
       discord_id = EXCLUDED.discord_id,
       minecraft_uuid = EXCLUDED.minecraft_uuid,
       minecraft_username = EXCLUDED.minecraft_username,
       rank_key = EXCLUDED.rank_key,
       price_id = EXCLUDED.price_id,
       amount_total = EXCLUDED.amount_total,
       currency = EXCLUDED.currency,
       payment_status = EXCLUDED.payment_status,
       active = EXCLUDED.active,
       updated_at = NOW()`,
    [
      String(session.id), eventId || null, paymentIntentId || null, discordId,
      minecraftUuid || null, minecraftUsername || null, rank.key, priceId || null,
      Number.isFinite(Number(session?.amount_total)) ? Number(session.amount_total) : null,
      String(session?.currency || '').toLowerCase() || null,
      paymentStatus, Boolean(active), purchasedAt,
    ]
  );

  if (active) {
    const sync = await syncAllPaidRankTargets(discordId, `stripe:${session.id}`);
    console.log(`[Stripe] grade ${rank.key} activé pour ${discordId}`, sync);
  }
  return { discordId, rank: rank.key, active };
}

async function deactivateStripeOrderByPaymentIntent(paymentIntentId, reason = 'refund') {
  if (!paymentIntentId) return { handled: false, reason: 'no_payment_intent' };
  const affected = await query(
    `UPDATE stripe_orders
     SET active = FALSE, payment_status = $2, updated_at = NOW()
     WHERE payment_intent_id = $1 AND active = TRUE
     RETURNING discord_id, checkout_session_id, rank_key`,
    [paymentIntentId, reason]
  );
  if (!affected.rowCount) return { handled: false, reason: 'order_not_found' };

  const discordIds = [...new Set(affected.rows.map((row) => row.discord_id))];
  for (const discordId of discordIds) {
    await syncAllPaidRankTargets(discordId, `stripe:${reason}:${paymentIntentId}`);
  }
  return { handled: true, affected: affected.rowCount };
}

async function handleStripeEvent(event) {
  const object = event?.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const paid = object.payment_status === 'paid' || object.payment_status === 'no_payment_required';
    return upsertStripeCheckout(object, event.id, paid);
  }

  if (event.type === 'checkout.session.async_payment_succeeded') {
    return upsertStripeCheckout(object, event.id, true);
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const result = await upsertStripeCheckout(object, event.id, false);
    await query(
      `UPDATE stripe_orders SET payment_status = 'failed', active = FALSE, updated_at = NOW()
       WHERE checkout_session_id = $1`,
      [String(object.id)]
    );
    await syncAllPaidRankTargets(result.discordId, `stripe:payment_failed:${object.id}`);
    return result;
  }

  if (event.type === 'charge.refunded') {
    const fullyRefunded = object.refunded === true || (
      Number.isFinite(Number(object.amount)) && Number(object.amount) > 0 && Number(object.amount_refunded) >= Number(object.amount)
    );
    if (!fullyRefunded) return { handled: false, reason: 'partial_refund' };
    return deactivateStripeOrderByPaymentIntent(stripeObjectId(object.payment_intent), 'refunded');
  }

  return { handled: false, reason: 'event_not_used' };
}

// Stripe doit recevoir le body brut pour vérifier Stripe-Signature.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const { webhookSecret } = stripeConfig();
  if (!webhookSecret) return res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET non configuré.' });
  if (!verifyStripeWebhook(req.body, req.get('Stripe-Signature'), webhookSecret)) {
    return res.status(400).json({ error: 'Signature Stripe invalide.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'JSON Stripe invalide.' });
  }

  try {
    const stored = await query(
      `INSERT INTO stripe_events(event_id, type, event_created_at, data, processed, received_at)
       VALUES ($1, $2, $3, $4::jsonb, FALSE, NOW())
       ON CONFLICT (event_id) DO UPDATE SET type = EXCLUDED.type
       RETURNING processed`,
      [
        String(event.id || ''), String(event.type || 'unknown'),
        Number.isFinite(Number(event.created)) ? new Date(Number(event.created) * 1000) : null,
        JSON.stringify(event.data || {}),
      ]
    );

    if (stored.rows[0]?.processed) return res.status(200).json({ received: true, duplicate: true });

    const result = await handleStripeEvent(event);
    await query(
      `UPDATE stripe_events SET processed = TRUE, process_error = NULL, processed_at = NOW() WHERE event_id = $1`,
      [event.id]
    );
    return res.status(200).json({ received: true, result });
  } catch (error) {
    console.error('[Stripe webhook]', event?.type, error);
    if (event?.id) {
      await query(
        `UPDATE stripe_events SET process_error = $2 WHERE event_id = $1`,
        [event.id, String(error.message || error).slice(0, 1000)]
      ).catch(() => {});
    }
    return res.status(500).json({ error: 'Erreur de traitement Stripe.' });
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

function adminIds() {
  return new Set(String(process.env.ADMIN_DISCORD_IDS || '').split(',').map((v) => v.trim()).filter(Boolean));
}
function isAdminId(id) { return adminIds().has(String(id)); }
function requireAuth(req, res, next) {
  if (!req.session?.discordId) return res.status(401).json({ error: 'Connexion Discord requise.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.discordId) return res.status(401).json({ error: 'Connexion requise.' });
  if (!isAdminId(req.session.discordId)) return res.status(403).json({ error: 'Accès administrateur requis.' });
  next();
}
function requireMinecraftSecret(req, res, next) {
  const expected = String(process.env.MINECRAFT_LINK_SECRET || '');
  const received = String(req.get('X-Trizone-Secret') || '');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(received, 'utf8');
  const valid = expectedBuf.length >= 16
    && expectedBuf.length === receivedBuf.length
    && crypto.timingSafeEqual(expectedBuf, receivedBuf);
  if (!valid) return res.status(401).json({ error: 'Secret serveur invalide.' });
  next();
}
function discordAvatarUrl(user) {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}
function normalizeRank(value) {
  const rank = String(value || 'default').trim().slice(0, 32);
  if (!rank || !/^[A-Za-z0-9 _\-]+$/.test(rank)) return 'default';
  return rank;
}


function normalizeKitKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  return key || null;
}

function normalizeUuid(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) return null;
  return raw;
}

// Floodgate utilise le prefixe "." sur Trizone. Un joueur Bedrock peut avoir un UUID
// different entre deux serveurs du reseau. Pour les vues Duels, son identite stable est donc
// bedrock:<pseudo-en-minuscules>. Les joueurs Java restent strictement separes par UUID.
function duelIdentityKeyFrom(username, uuid) {
  const name = String(username || '').trim();
  const id = normalizeUuid(uuid);
  if (name.startsWith('.')) return `bedrock:${name.toLowerCase()}`;
  return id ? `uuid:${id}` : null;
}

function duelIdentityKeySql(alias = '') {
  const a = alias ? `${alias}.` : '';
  return `CASE WHEN LEFT(COALESCE(${a}minecraft_username,''),1)='.' THEN 'bedrock:' || LOWER(${a}minecraft_username) ELSE 'uuid:' || ${a}minecraft_uuid END`;
}

function duelIdentityCtesSql() {
  const accountKey = duelIdentityKeySql('a');
  const statKey = duelIdentityKeySql('s');
  const settingKey = duelIdentityKeySql('p');
  return `
    identity_candidates AS (
      SELECT ${accountKey} AS identity_key,a.minecraft_uuid,a.minecraft_username,3 AS source_priority,a.updated_at
      FROM minecraft_accounts a WHERE a.minecraft_username IS NOT NULL
      UNION ALL
      SELECT ${statKey} AS identity_key,s.minecraft_uuid,s.minecraft_username,2 AS source_priority,s.updated_at
      FROM duel_player_stats s
      UNION ALL
      SELECT ${settingKey} AS identity_key,p.minecraft_uuid,p.minecraft_username,1 AS source_priority,p.updated_at
      FROM duel_player_settings p WHERE p.minecraft_username IS NOT NULL
    ),
    identities AS (
      SELECT DISTINCT ON (identity_key) identity_key,minecraft_uuid,minecraft_username
      FROM identity_candidates
      WHERE identity_key IS NOT NULL
      ORDER BY identity_key,source_priority DESC,updated_at DESC NULLS LAST
    ),
    stat_candidates AS (
      SELECT ${statKey} AS identity_key,s.*,
             ROW_NUMBER() OVER (
               PARTITION BY ${statKey},s.kit_key
               ORDER BY (s.wins+s.losses+s.kills+s.deaths) DESC,ABS(s.elo-300) DESC,s.updated_at DESC
             ) AS identity_rn
      FROM duel_player_stats s
    ),
    best_stats AS (SELECT * FROM stat_candidates WHERE identity_rn=1)
  `;
}

async function resolveDuelIdentity(identity) {
  const raw = String(identity || '').trim();
  if (!raw) return null;
  const asUuid = normalizeUuid(raw);
  if (asUuid) {
    const found = await query(`
      SELECT minecraft_uuid,minecraft_username FROM (
        SELECT minecraft_uuid,minecraft_username,updated_at FROM minecraft_accounts
        UNION ALL SELECT minecraft_uuid,minecraft_username,updated_at FROM duel_player_stats
        UNION ALL SELECT minecraft_uuid,minecraft_username,updated_at FROM duel_player_settings
      ) x WHERE minecraft_uuid=$1 AND minecraft_username IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [asUuid]);
    const username = found.rows[0]?.minecraft_username || null;
    return { identityKey: duelIdentityKeyFrom(username, asUuid) || `uuid:${asUuid}`, uuid: asUuid, username };
  }
  if (raw.startsWith('.')) return { identityKey: `bedrock:${raw.toLowerCase()}`, uuid: null, username: raw };
  const found = await query(`
    SELECT minecraft_uuid,minecraft_username FROM (
      SELECT minecraft_uuid,minecraft_username,updated_at FROM minecraft_accounts
      UNION ALL SELECT minecraft_uuid,minecraft_username,updated_at FROM duel_player_stats
      UNION ALL SELECT minecraft_uuid,minecraft_username,updated_at FROM duel_player_settings
    ) x WHERE LOWER(minecraft_username)=LOWER($1)
    ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [raw]);
  const row = found.rows[0];
  if (!row) return null;
  return { identityKey: duelIdentityKeyFrom(row.minecraft_username,row.minecraft_uuid), uuid: row.minecraft_uuid, username: row.minecraft_username };
}

const DUEL_TIER_ORDER = ['LT5','HT5','LT4','HT4','LT3','HT3','LT2','HT2','LT1','HT1'];
const DUEL_TIER_DEFAULTS = Object.freeze({LT5:300,HT5:350,LT4:400,HT4:450,LT3:500,HT3:600,LT2:800,HT2:1000,LT1:1250,HT1:1500});
let duelTierThresholds = { ...DUEL_TIER_DEFAULTS };

function normalizeDuelTierThresholds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  let previous = -1;
  for (const tier of DUEL_TIER_ORDER) {
    const n = Number(value[tier]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n <= previous) return null;
    out[tier] = n;
    previous = n;
  }
  return out;
}

function duelTier(eloValue) {
  const elo = Number(eloValue || 0);
  for (let i = DUEL_TIER_ORDER.length - 1; i >= 0; i -= 1) {
    const tier = DUEL_TIER_ORDER[i];
    if (elo >= duelTierThresholds[tier]) return tier;
  }
  return 'LT5';
}

function duelKdr(kills, deaths) {
  const k = Number(kills || 0);
  const d = Number(deaths || 0);
  return d <= 0 ? k : Math.round((k / d) * 100) / 100;
}

async function duelPlayerPayload(identity) {
  const resolved = await resolveDuelIdentity(identity);
  if (!resolved?.identityKey) return null;
  const identityKey = resolved.identityKey;
  const ctes = duelIdentityCtesSql();
  const settingKey = duelIdentityKeySql('p');

  const [settings, rows, catalog, overallRank] = await Promise.all([
    query(`SELECT selected_kit,minecraft_username,minecraft_uuid FROM duel_player_settings p
           WHERE ${settingKey}=$1 ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [identityKey]),
    query(`
      WITH ${ctes}, base AS (
        SELECT i.identity_key,i.minecraft_uuid,i.minecraft_username,k.kit_key,k.display_name,k.icon_material,k.emoji,k.sort_order,
               COALESCE(s.elo,300)::int AS elo,COALESCE(s.wins,0)::int AS wins,COALESCE(s.losses,0)::int AS losses,
               COALESCE(s.kills,0)::int AS kills,COALESCE(s.deaths,0)::int AS deaths,COALESCE(s.streak,0)::int AS streak,
               COALESCE(s.best_streak,0)::int AS best_streak,s.updated_at,(s.minecraft_uuid IS NOT NULL) AS played
        FROM identities i CROSS JOIN (SELECT * FROM duel_kits WHERE active=TRUE) k
        LEFT JOIN best_stats s ON s.identity_key=i.identity_key AND s.kit_key=k.kit_key
      ), ranked AS (
        SELECT *,RANK() OVER (PARTITION BY kit_key ORDER BY elo DESC,wins DESC,losses ASC) AS placement FROM base
      ) SELECT * FROM ranked WHERE identity_key=$1 ORDER BY sort_order,display_name
    `, [identityKey]),
    query(`SELECT kit_key,display_name,icon_material,emoji,sort_order FROM duel_kits WHERE active=TRUE ORDER BY sort_order,display_name`),
    query(`
      WITH ${ctes}, all_kit_stats AS (
        SELECT i.identity_key,i.minecraft_uuid,i.minecraft_username,k.kit_key,
               COALESCE(s.elo,300)::int AS elo,COALESCE(s.wins,0)::int AS wins,COALESCE(s.losses,0)::int AS losses,
               COALESCE(s.kills,0)::int AS kills,COALESCE(s.deaths,0)::int AS deaths
        FROM identities i CROSS JOIN (SELECT * FROM duel_kits WHERE active=TRUE) k
        LEFT JOIN best_stats s ON s.identity_key=i.identity_key AND s.kit_key=k.kit_key
      ), agg AS (
        SELECT identity_key,minecraft_uuid,minecraft_username,COALESCE(ROUND(AVG(elo))::int,300) AS elo,
               COALESCE(SUM(wins),0)::int AS wins,COALESCE(SUM(losses),0)::int AS losses,
               COALESCE(SUM(kills),0)::int AS kills,COALESCE(SUM(deaths),0)::int AS deaths
        FROM all_kit_stats
        GROUP BY identity_key,minecraft_uuid,minecraft_username
      ), ranked AS (
        SELECT *,RANK() OVER (ORDER BY elo DESC,wins DESC,losses ASC) AS placement FROM agg
      ) SELECT * FROM ranked WHERE identity_key=$1
    `, [identityKey])
  ]);

  const representative = rows.rows[0] || overallRank.rows[0] || settings.rows[0] || {};
  const uuid = representative.minecraft_uuid || resolved.uuid;
  const username = representative.minecraft_username || resolved.username || uuid || identityKey;
  const statsByKit = new Map(rows.rows.map((row) => [row.kit_key,row]));
  const kits = catalog.rows.map((kit) => {
    const row = statsByKit.get(kit.kit_key);
    const elo=Number(row?.elo ?? 300), wins=Number(row?.wins ?? 0), losses=Number(row?.losses ?? 0), kills=Number(row?.kills ?? 0), deaths=Number(row?.deaths ?? 0);
    return {
      kit:kit.kit_key,name:kit.display_name,icon:kit.icon_material,emoji:kit.emoji,elo,tier:duelTier(elo),wins,losses,kills,deaths,
      kdr:duelKdr(kills,deaths),win_rate:(wins+losses)?Math.round(wins/(wins+losses)*10000)/100:0,
      streak:Number(row?.streak ?? 0),best_streak:Number(row?.best_streak ?? 0),placement:Number(row?.placement ?? 0),
      played:Boolean(row?.played),updated_at:row?.updated_at || null
    };
  });

  if (!kits.length && !rows.rowCount && !overallRank.rowCount) return null;
  const o=overallRank.rows[0] || {elo:300,wins:0,losses:0,kills:0,deaths:0,placement:0};
  const selected=settings.rows[0]?.selected_kit;
  return {
    uuid,username,identity_key:identityKey,selected_kit:kits.some((kit)=>kit.kit===selected)?selected:(kits[0]?.kit||null),
    overall:{elo:Number(o.elo||300),tier:duelTier(o.elo||300),wins:Number(o.wins||0),losses:Number(o.losses||0),kills:Number(o.kills||0),deaths:Number(o.deaths||0),kdr:duelKdr(o.kills,o.deaths),placement:Number(o.placement||0)},
    kits
  };
}

async function getCurrentUser(discordId) {
  const result = await query(
    `SELECT u.discord_id, u.discord_username, u.discord_global_name, u.discord_avatar,
            u.created_at, u.last_login_at, u.banned,
            m.minecraft_uuid, m.minecraft_username, m.minecraft_rank, m.linked_at, m.updated_at
     FROM users u
     LEFT JOIN minecraft_accounts m ON m.discord_id = u.discord_id
     WHERE u.discord_id = $1`,
    [discordId]
  );
  return result.rows[0] || null;
}

async function getSiteConfig() {
  const result = await query('SELECT key, value FROM site_settings');
  const saved = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  if (saved.status_description === 'Disponibilité du proxy et des serveurs Trizone sur les 20 dernières minutes.') {
    saved.status_description = 'Disponibilité du proxy et des serveurs Trizone sur les 60 dernières minutes.';
  }
  return Object.fromEntries(Object.entries(SITE_SETTINGS).map(([key, rule]) => [key, saved[key] ?? rule.fallback]));
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'trizone-site', version: '3.3.1' }));

app.get('/api/server-status', async (_req, res) => {
  let config = {};
  try { config = await getSiteConfig(); } catch {}
  const address = config.server_address || 'play.trizone.club';
  const proxy = minecraftServerConfigs()[0];
  try {
    const status = await readCalagopusStatus(proxy.serverId, proxy.label);
    if (!status.configured) {
      return res.json({ configured: false, available: false, label: proxy.label, address });
    }
    return res.json({ ...status, address });
  } catch (error) {
    console.warn('[server-status]', error.message);
    return res.json({ configured: true, available: false, label: proxy.label, address, updated_at: new Date().toISOString() });
  }
});

app.get('/api/status-board', async (_req, res) => {
  try {
    res.json(await getFreshStatusBoard());
  } catch (error) {
    console.warn('[status-board]', error.message);
    res.status(503).json({ error: 'Impossible de récupérer le statut Calagopus.' });
  }
});

app.get('/auth/discord', sensitiveLimiter, (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/auth/discord/callback`;
  if (!clientId) return res.status(503).send('Discord OAuth non configuré.');

  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify',
    state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', sensitiveLimiter, async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session?.oauthState) return res.status(400).send('État OAuth Discord invalide.');
    delete req.session.oauthState;

    const redirectUri = process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/auth/discord/callback`;
    const tokenBody = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    if (!tokenResponse.ok) {
      console.error('Discord token', await tokenResponse.text());
      return res.status(502).send('Impossible de terminer la connexion Discord.');
    }

    const token = await tokenResponse.json();
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userResponse.ok) return res.status(502).send('Impossible de récupérer le profil Discord.');
    const user = await userResponse.json();

    await query(
      `INSERT INTO users(discord_id, discord_username, discord_global_name, discord_avatar, last_login_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (discord_id) DO UPDATE SET
         discord_username = EXCLUDED.discord_username,
         discord_global_name = EXCLUDED.discord_global_name,
         discord_avatar = EXCLUDED.discord_avatar,
         last_login_at = NOW()`,
      [user.id, user.username, user.global_name || null, discordAvatarUrl(user)]
    );

    req.session.discordId = user.id;
    // Si le joueur avait acheté avant de rejoindre le Discord ou si un rôle avait
    // raté sa livraison, une nouvelle connexion au site tente une resynchronisation.
    syncDiscordPaidRank(user.id).catch((error) => console.warn('[Discord rank login sync]', error.message));
    res.redirect('/account.html');
  } catch (error) {
    console.error('[Discord OAuth]', error);
    res.status(500).send('Erreur de connexion Discord.');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  try {
    if (!req.session?.discordId) return res.json({ authenticated: false });
    const user = await getCurrentUser(req.session.discordId);
    if (!user || user.banned) {
      req.session = null;
      return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, admin: isAdminId(user.discord_id), user });
  } catch (error) {
    console.error('[api/me]', error);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/site-config', async (_req, res) => {
  try { res.json(await getSiteConfig()); }
  catch (error) {
    console.error('[site config]', error);
    res.json(Object.fromEntries(Object.entries(SITE_SETTINGS).map(([key, rule]) => [key, rule.fallback])));
  }
});

app.get('/api/announcement', async (_req, res) => {
  try {
    const config = await getSiteConfig();
    res.json({ value: config.announcement });
  } catch { res.json({ value: '' }); }
});

app.post('/api/account/link-code', requireAuth, sensitiveLimiter, async (req, res) => {
  try {
    const code = String(crypto.randomInt(100000, 1000000));
    await query('DELETE FROM link_codes WHERE discord_id = $1 OR expires_at < NOW()', [req.session.discordId]);
    await query(
      `INSERT INTO link_codes(code, discord_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [code, req.session.discordId]
    );
    res.json({ code, expiresInSeconds: 600 });
  } catch (error) {
    console.error('[link-code]', error);
    res.status(500).json({ error: 'Impossible de générer le code.' });
  }
});

app.post('/api/minecraft/link/confirm', requireMinecraftSecret, sensitiveLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    const uuid = String(req.body?.uuid || '').trim();
    const username = String(req.body?.username || '').trim();
    const rank = normalizeRank(req.body?.rank);

    if (!/^\d{6}$/.test(code) || !/^[0-9a-fA-F-]{32,36}$/.test(uuid) || !/^[A-Za-z0-9_.+*\-]{1,32}$/.test(username)) {
      return res.status(400).json({ error: 'Données invalides.' });
    }

    const found = await query('SELECT discord_id FROM link_codes WHERE code = $1 AND expires_at > NOW()', [code]);
    if (!found.rowCount) return res.status(404).json({ error: 'Code invalide ou expiré.' });
    const discordId = found.rows[0].discord_id;

    const existingUuid = await query('SELECT discord_id FROM minecraft_accounts WHERE minecraft_uuid = $1', [uuid]);
    if (existingUuid.rowCount && existingUuid.rows[0].discord_id !== discordId) {
      return res.status(409).json({ error: 'Ce compte Minecraft est déjà lié à un autre compte.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO minecraft_accounts(discord_id, minecraft_uuid, minecraft_username, minecraft_rank, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           minecraft_uuid = EXCLUDED.minecraft_uuid,
           minecraft_username = EXCLUDED.minecraft_username,
           minecraft_rank = EXCLUDED.minecraft_rank,
           updated_at = NOW()`,
        [discordId, uuid, username, rank]
      );
      await client.query('DELETE FROM link_codes WHERE code = $1', [code]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    enqueueMinecraftRankSync(discordId, 'account_linked').catch((error) => console.warn('[Minecraft rank link sync]', error.message));
    res.json({ ok: true, message: `Compte ${username} lié avec succès.`, rank });
  } catch (error) {
    console.error('[minecraft link]', error);
    res.status(500).json({ error: 'Erreur lors de la liaison.' });
  }
});

app.post('/api/minecraft/profile-sync', requireMinecraftSecret, sensitiveLimiter, async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || '').trim();
    const username = String(req.body?.username || '').trim();
    const rank = normalizeRank(req.body?.rank);
    if (!/^[0-9a-fA-F-]{32,36}$/.test(uuid) || !/^[A-Za-z0-9_.+*\-]{1,32}$/.test(username)) {
      return res.status(400).json({ error: 'Données invalides.' });
    }
    const result = await query(
      `UPDATE minecraft_accounts
       SET minecraft_username = $2, minecraft_rank = $3, updated_at = NOW()
       WHERE minecraft_uuid = $1
       RETURNING discord_id`,
      [uuid, username, rank]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Ce compte Minecraft n’est pas encore lié au site.' });
    res.json({ ok: true, rank });
  } catch (error) {
    console.error('[minecraft profile sync]', error);
    res.status(500).json({ error: 'Impossible de synchroniser le profil.' });
  }
});


app.get('/api/minecraft/deliveries', requireMinecraftSecret, async (req, res) => {
  try {
    const result = await query(
      `UPDATE minecraft_deliveries
       SET attempt_count = attempt_count + 1, last_attempt_at = NOW(), updated_at = NOW()
       WHERE id IN (
         SELECT id FROM minecraft_deliveries
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 20
       )
       RETURNING id, minecraft_uuid, minecraft_username, target_rank, reason`,
    );
    const rows = result.rows.sort((a, b) => Number(a.id) - Number(b.id));
    if (String(req.query.format || '').toLowerCase() === 'lines') {
      const lines = rows.map((row) => `${row.id}|${row.minecraft_uuid}|${row.minecraft_username}|${row.target_rank}`).join('\n');
      res.type('text/plain').send(lines ? `${lines}\n` : '');
      return;
    }
    res.json({ data: rows });
  } catch (error) {
    console.error('[minecraft deliveries]', error);
    res.status(500).json({ error: 'Impossible de charger les livraisons.' });
  }
});

app.post('/api/minecraft/deliveries/:id/ack', requireMinecraftSecret, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de livraison invalide.' });
    const ok = req.body?.ok === true;
    const errorMessage = String(req.body?.error || '').trim().slice(0, 1000) || null;

    if (!ok) {
      await query(
        `UPDATE minecraft_deliveries
         SET last_error = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [id, errorMessage || 'Erreur inconnue côté serveur Minecraft']
      );
      return res.json({ ok: true, retry: true });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const delivery = await client.query(
        `UPDATE minecraft_deliveries
         SET status = 'delivered', delivered_at = NOW(), last_error = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING discord_id, minecraft_uuid, target_rank`,
        [id]
      );
      if (delivery.rowCount) {
        const row = delivery.rows[0];
        await client.query(
          `UPDATE minecraft_accounts
           SET minecraft_rank = $2, updated_at = NOW()
           WHERE discord_id = $1 AND minecraft_uuid = $3`,
          [row.discord_id, row.target_rank, row.minecraft_uuid]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[minecraft delivery ack]', error);
    res.status(500).json({ error: 'Impossible de confirmer la livraison.' });
  }
});


let shopCache = { expires: 0, data: null };

async function fetchStripeShopProducts() {
  if (shopCache.data && Date.now() < shopCache.expires) return shopCache.data;

  const ranks = paidRankConfig().filter((rank) => rank.priceId);
  if (!ranks.length) throw new Error('Aucun STRIPE_PRICE_*_ID configuré.');

  const products = [];
  for (const rank of ranks) {
    const price = await stripeApi('GET', `/prices/${encodeURIComponent(rank.priceId)}?expand[]=product`);
    const product = price.product && typeof price.product === 'object' ? price.product : {};
    if (price.active === false || product.active === false) continue;
    products.push({
      id: rank.key,
      rank: rank.key,
      name: String(product.name || rank.key),
      description: String(product.description || `Grade ${rank.key} Trizone`),
      image: Array.isArray(product.images) ? (product.images[0] || '') : '',
      unit_amount: Number(price.unit_amount || 0),
      currency: String(price.currency || 'chf').toUpperCase(),
      price_id: rank.priceId,
    });
  }

  const data = {
    data: [{ id: 'grades', name: 'Grades', packages: products }],
    provider: 'stripe_managed_payments',
  };
  shopCache = { data, expires: Date.now() + 60_000 };
  return data;
}


// ---- Duels v3.2.4 : catalogue kits autoritaire depuis kits.yml du Lobby ----
function parseLobbyKitCatalog(content) {
  const out = [];
  const text = String(content || '').replace(/\r/g, '');
  const lines = text.split('\n');
  let inKits = false;
  let rootIndent = -1;
  let kitIndent = -1;
  const seen = new Set();

  const indentOf = (line) => {
    let n = 0;
    for (const c of line) {
      if (c === ' ') n += 1;
      else if (c === '\t') n += 2;
      else break;
    }
    return n;
  };
  const unquote = (value) => {
    let v = String(value || '').trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    return v;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = indentOf(rawLine);
    if (!inKits) {
      if (/^kits\s*:\s*(?:#.*)?$/i.test(trimmed)) {
        inKits = true;
        rootIndent = indent;
      }
      continue;
    }
    if (indent <= rootIndent) break;
    if (kitIndent < 0) kitIndent = indent;
    if (indent !== kitIndent || !trimmed.endsWith(':')) continue;
    const rawKey = unquote(trimmed.slice(0, -1).trim());
    const key = normalizeKitKey(rawKey);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

async function getLobbyCanonicalKitKeys(db = null) {
  const run = db ? db.query.bind(db) : query;
  const result = await run(`SELECT content FROM duel_sync_files WHERE file_key='kits.yml' LIMIT 1`);
  if (!result.rowCount) return null;
  const keys = parseLobbyKitCatalog(result.rows[0].content);
  return keys.length ? keys : null;
}

async function reconcileDuelKitsWithLobbyFile(db = null) {
  const run = db ? db.query.bind(db) : query;
  const keys = await getLobbyCanonicalKitKeys(db);
  if (!keys || !keys.length) return { applied: false, keys: [] };
  await run(`UPDATE duel_kits SET active = (kit_key = ANY($1::text[])), updated_at = CASE WHEN active IS DISTINCT FROM (kit_key = ANY($1::text[])) THEN NOW() ELSE updated_at END`, [keys]);
  return { applied: true, keys };
}

// ---- Duels v3 : kits dynamiques, ELO par kit, profils et leaderboard ----
app.post('/api/minecraft/duels/snapshot', requireMinecraftSecret, minecraftSyncLimiter, async (req, res) => {
  const sourceMode = String(req.body?.source_mode || 'LEGACY').trim().toUpperCase();
  const authoritative = sourceMode === 'BACKEND';
  const kits = Array.isArray(req.body?.kits) ? req.body.kits.slice(0, 250) : [];
  const players = Array.isArray(req.body?.players) ? req.body.players.slice(0, 10000) : [];
  const incomingTiers = authoritative ? normalizeDuelTierThresholds(req.body?.tiers) : null;
  if (!kits.length) return res.status(400).json({ error: 'Aucun kit dans le snapshot.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const canonicalKeys = await getLobbyCanonicalKitKeys(client);
    const canonicalSet = canonicalKeys ? new Set(canonicalKeys) : null;
    const incomingKitKeys = [];
    for (let i = 0; i < kits.length; i += 1) {
      const row = kits[i] || {}; const key = normalizeKitKey(row.key); if (!key) continue;
      // Si kits.yml du Lobby est connu, il est la source de verite du catalogue.
      // Un ancien snapshot PVPpractice ne peut donc plus reactiver un kit supprime.
      if (canonicalSet && !canonicalSet.has(key)) continue;
      incomingKitKeys.push(key);
      const name = String(row.name || key).slice(0, 80);
      const icon = String(row.icon || 'IRON_SWORD').replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'IRON_SWORD';
      const emoji = String(row.emoji || '⚔').slice(0, 12);
      if (authoritative) {
        await client.query(`INSERT INTO duel_kits(kit_key,display_name,icon_material,emoji,sort_order,active,updated_at) VALUES($1,$2,$3,$4,$5,TRUE,NOW())
          ON CONFLICT(kit_key) DO UPDATE SET display_name=EXCLUDED.display_name, emoji=EXCLUDED.emoji, active=TRUE, updated_at=NOW()`,
          [key,name,icon,emoji,Number(row.order ?? i)]);
      } else {
        // Le Lobby peut annoncer un nouveau kit, mais ne peut pas reactiver un kit que le BACKEND a supprime.
        await client.query(`INSERT INTO duel_kits(kit_key,display_name,icon_material,emoji,sort_order,active,updated_at) VALUES($1,$2,$3,$4,$5,TRUE,NOW())
          ON CONFLICT(kit_key) DO UPDATE SET display_name=EXCLUDED.display_name, emoji=EXCLUDED.emoji, updated_at=NOW()`,
          [key,name,icon,emoji,Number(row.order ?? i)]);
      }
    }

    // Le snapshot BACKEND est la liste officielle des kits actuellement existants.
    // On garde les anciennes stats en base, mais les kits absents deviennent inactifs et disparaissent du site.
    if (canonicalKeys && canonicalKeys.length) {
      await client.query(`UPDATE duel_kits SET active=FALSE, updated_at=NOW()
        WHERE active=TRUE AND NOT (kit_key = ANY($1::text[]))`, [canonicalKeys]);
    } else if (authoritative && incomingKitKeys.length) {
      await client.query(`UPDATE duel_kits SET active=FALSE, updated_at=NOW()
        WHERE active=TRUE AND NOT (kit_key = ANY($1::text[]))`, [incomingKitKeys]);
    }

    // Seul PVPpractice (BACKEND) a le droit d'ecraser les ELO/stats.
    // Le Lobby peut publier les nouveaux kits sans risquer d'envoyer des stats de miroir en retard.
    if (authoritative) {
      for (const player of players) {
        const uuid = normalizeUuid(player?.uuid); if (!uuid) continue;
        const username = String(player?.username || uuid).slice(0, 32);
        const selected = normalizeKitKey(player?.selected_kit);
        if (selected) await client.query(`INSERT INTO duel_player_settings(minecraft_uuid,minecraft_username,selected_kit,updated_at) VALUES($1,$2,$3,NOW())
          ON CONFLICT(minecraft_uuid) DO UPDATE SET minecraft_username=EXCLUDED.minecraft_username, selected_kit=EXCLUDED.selected_kit, updated_at=NOW()`, [uuid,username,selected]);
        const statRows = Array.isArray(player?.kits) ? player.kits : [];
        for (const st of statRows.slice(0,250)) {
          const kit = normalizeKitKey(st?.kit); if (!kit) continue;
          await client.query(`INSERT INTO duel_player_stats(minecraft_uuid,minecraft_username,kit_key,elo,wins,losses,kills,deaths,streak,best_streak,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(minecraft_uuid,kit_key) DO UPDATE SET minecraft_username=EXCLUDED.minecraft_username, elo=EXCLUDED.elo, wins=EXCLUDED.wins, losses=EXCLUDED.losses, kills=EXCLUDED.kills, deaths=EXCLUDED.deaths, streak=EXCLUDED.streak, best_streak=EXCLUDED.best_streak, updated_at=NOW()`,
            [uuid,username,kit,Number(st.elo||300),Number(st.wins||0),Number(st.losses||0),Number(st.kills||0),Number(st.deaths||0),Number(st.streak||0),Number(st.best_streak||0)]);
        }
      }
    }
    await client.query('COMMIT');
    if (incomingTiers) duelTierThresholds = incomingTiers;
    res.json({ ok: true, source_mode: sourceMode, authoritative, kits: kits.length, players: authoritative ? players.length : 0, tiers: duelTierThresholds });
  } catch (error) { await client.query('ROLLBACK'); console.error('[duels snapshot]', error); res.status(500).json({ error: 'Synchronisation duels impossible.' }); }
  finally { client.release(); }
});


function propertiesEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

async function applyDuelKitOrder(requestedOrder) {
  const requested = Array.isArray(requestedOrder)
    ? [...new Set(requestedOrder.map(normalizeKitKey).filter(Boolean))].slice(0, 250)
    : [];
  if (!requested.length) throw new Error('Ordre des kits vide.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT kit_key FROM duel_kits WHERE active=TRUE ORDER BY sort_order, display_name');
    const existing = current.rows.map((row) => row.kit_key);
    const finalOrder = requested.filter((key) => existing.includes(key));
    for (const key of existing) if (!finalOrder.includes(key)) finalOrder.push(key);
    if (!finalOrder.length) throw new Error('Aucun kit valide dans cet ordre.');
    for (let i = 0; i < finalOrder.length; i += 1) {
      await client.query('UPDATE duel_kits SET sort_order=$2, updated_at=NOW() WHERE kit_key=$1', [finalOrder[i], i]);
    }
    await client.query('COMMIT');
    return finalOrder;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


// Icône visuelle choisie en jeu avec /kiticon <kit>.
// Le Material est conservé sur le site et redistribué à tous les serveurs Paper via le snapshot réseau.
app.post('/api/minecraft/duels/kits/icon', requireMinecraftSecret, minecraftSyncLimiter, async (req, res) => {
  try {
    const kit = normalizeKitKey(req.body?.kit);
    const icon = String(req.body?.icon || '').trim().toUpperCase().replace(/^MINECRAFT:/, '').replace(/[^A-Z0-9_]/g, '').slice(0, 64);
    if (!kit || !icon) return res.status(400).json({ error: 'Kit ou Material invalide.' });
    const result = await query(`UPDATE duel_kits SET icon_material=$2, updated_at=NOW() WHERE kit_key=$1 AND active=TRUE RETURNING kit_key,display_name,icon_material`, [kit, icon]);
    if (!result.rowCount) return res.status(404).json({ error: 'Kit inconnu.' });
    res.json({ ok: true, kit: result.rows[0].kit_key, icon: result.rows[0].icon_material });
  } catch (error) {
    console.error('[duels kit icon]', error);
    res.status(500).json({ error: 'Impossible de modifier l\'icône du kit.' });
  }
});

// Relay fiable du fichier kits.yml : Lobby -> site -> PVPpractice.
app.post('/api/minecraft/duels/kits-file', requireMinecraftSecret, minecraftSyncLimiter, express.text({ type: 'text/plain', limit: '2mb' }), async (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : '';
    if (!content.trim() || !/(^|\n)\s*kits\s*:/m.test(content)) return res.status(400).json({ error: 'kits.yml invalide.' });
    const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    const announced = String(req.get('X-Trizone-Hash') || '').trim().toLowerCase();
    if (announced && announced !== sha256) return res.status(400).json({ error: 'Hash kits.yml invalide.' });
    const source = String(req.get('X-Trizone-Source') || 'Lobby').slice(0, 80);
    await query(`INSERT INTO duel_sync_files(file_key,content,sha256,source_server,updated_at)
      VALUES('kits.yml',$1,$2,$3,NOW())
      ON CONFLICT(file_key) DO UPDATE SET content=EXCLUDED.content,sha256=EXCLUDED.sha256,source_server=EXCLUDED.source_server,updated_at=NOW()`,
      [content, sha256, source]);
    const reconciled = await reconcileDuelKitsWithLobbyFile();
    res.json({ ok: true, sha256, bytes: Buffer.byteLength(content, 'utf8'), canonical_kits: reconciled.keys });
  } catch (error) {
    console.error('[duels kits-file POST]', error);
    res.status(500).json({ error: 'Impossible de sauvegarder kits.yml.' });
  }
});

app.get('/api/minecraft/duels/kits-file', requireMinecraftSecret, minecraftSyncLimiter, async (_req, res) => {
  try {
    const result = await query(`SELECT content,sha256,source_server,updated_at FROM duel_sync_files WHERE file_key='kits.yml' LIMIT 1`);
    if (!result.rowCount) return res.status(404).send('Aucun kits.yml synchronise.');
    const row = result.rows[0];
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('X-Trizone-Hash', row.sha256);
    res.set('X-Trizone-Source', row.source_server || 'Lobby');
    res.send(row.content);
  } catch (error) {
    console.error('[duels kits-file GET]', error);
    res.status(500).send('Erreur kits.yml.');
  }
});

// Snapshot texte leger lu par le meme JAR sur Lobby, PVPpractice et les autres serveurs Paper.
app.get('/api/minecraft/duels/network-snapshot.properties', requireMinecraftSecret, minecraftSyncLimiter, async (_req, res) => {
  try {
    const [kitsResult, identitiesResult, settingsResult, statsResult] = await Promise.all([
      query(`SELECT kit_key,display_name,icon_material,emoji,sort_order FROM duel_kits WHERE active=TRUE ORDER BY sort_order,display_name`),
      query(`SELECT minecraft_uuid, MAX(minecraft_username) AS minecraft_username FROM (
        SELECT minecraft_uuid,minecraft_username FROM minecraft_accounts
        UNION ALL SELECT minecraft_uuid,minecraft_username FROM duel_player_stats
        UNION ALL SELECT minecraft_uuid,minecraft_username FROM duel_player_settings WHERE minecraft_username IS NOT NULL
      ) x GROUP BY minecraft_uuid ORDER BY MAX(minecraft_username)`),
      query(`SELECT s.minecraft_uuid,s.minecraft_username,s.selected_kit FROM duel_player_settings s JOIN duel_kits k ON k.kit_key=s.selected_kit WHERE k.active=TRUE`),
      query(`SELECT s.minecraft_uuid,s.minecraft_username,s.kit_key,s.elo,s.wins,s.losses,s.kills,s.deaths,s.streak,s.best_streak FROM duel_player_stats s JOIN duel_kits k ON k.kit_key=s.kit_key WHERE k.active=TRUE`)
    ]);

    const lines = ['# Trizone Duels network snapshot v3.2'];
    for (const tier of DUEL_TIER_ORDER) lines.push(`tier.threshold.${tier}=${Number(duelTierThresholds[tier] ?? DUEL_TIER_DEFAULTS[tier])}`);
    for (const kit of kitsResult.rows) {
      const key = normalizeKitKey(kit.kit_key); if (!key) continue;
      lines.push(`kit.${key}.name=${propertiesEscape(kit.display_name)}`);
      lines.push(`kit.${key}.icon=${propertiesEscape(kit.icon_material || 'IRON_SWORD')}`);
      lines.push(`kit.${key}.emoji=${propertiesEscape(kit.emoji || '⚔')}`);
      lines.push(`kit.${key}.order=${Number(kit.sort_order || 0)}`);
    }

    const names = new Map();
    for (const row of identitiesResult.rows) {
      const uuid = normalizeUuid(row.minecraft_uuid); if (!uuid) continue;
      const username = String(row.minecraft_username || uuid).slice(0, 32);
      names.set(uuid, username);
      lines.push(`player.${uuid}.name=${propertiesEscape(username)}`);
    }
    for (const row of settingsResult.rows) {
      const uuid = normalizeUuid(row.minecraft_uuid); if (!uuid) continue;
      const username = String(row.minecraft_username || names.get(uuid) || uuid).slice(0,32);
      if (!names.has(uuid)) lines.push(`player.${uuid}.name=${propertiesEscape(username)}`);
      const selected = normalizeKitKey(row.selected_kit);
      if (selected) lines.push(`player.${uuid}.selected=${selected}`);
    }
    for (const row of statsResult.rows) {
      const uuid = normalizeUuid(row.minecraft_uuid); const kit = normalizeKitKey(row.kit_key);
      if (!uuid || !kit) continue;
      const username = String(row.minecraft_username || names.get(uuid) || uuid).slice(0,32);
      if (!names.has(uuid)) {
        names.set(uuid, username);
        lines.push(`player.${uuid}.name=${propertiesEscape(username)}`);
      }
      const base = `rating.${uuid}.${kit}.`;
      lines.push(`${base}elo=${Number(row.elo || 300)}`);
      lines.push(`${base}wins=${Number(row.wins || 0)}`);
      lines.push(`${base}losses=${Number(row.losses || 0)}`);
      lines.push(`${base}kills=${Number(row.kills || 0)}`);
      lines.push(`${base}deaths=${Number(row.deaths || 0)}`);
      lines.push(`${base}streak=${Number(row.streak || 0)}`);
      lines.push(`${base}best-streak=${Number(row.best_streak || 0)}`);
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`${lines.join('\n')}\n`);
  } catch (error) {
    console.error('[duels network snapshot]', error);
    res.status(500).send('Impossible de charger le snapshot reseau.');
  }
});

app.post('/api/minecraft/duels/kits/order', requireMinecraftSecret, minecraftSyncLimiter, async (req, res) => {
  try {
    const order = await applyDuelKitOrder(req.body?.order);
    res.json({ ok: true, order });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Ordre invalide.' });
  }
});

app.post('/api/minecraft/duels/settings', requireMinecraftSecret, minecraftSyncLimiter, async (req, res) => {
  try {
    const uuid = normalizeUuid(req.body?.uuid); const kit = normalizeKitKey(req.body?.kit);
    if (!uuid || !kit) return res.status(400).json({ error: 'UUID ou kit invalide.' });
    const exists = await query('SELECT 1 FROM duel_kits WHERE kit_key=$1 AND active=TRUE',[kit]); if (!exists.rowCount) return res.status(404).json({ error: 'Kit inconnu.' });
    const username = String(req.body?.username || '').slice(0,32) || null;
    await query(`INSERT INTO duel_player_settings(minecraft_uuid,minecraft_username,selected_kit,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(minecraft_uuid) DO UPDATE SET minecraft_username=COALESCE(EXCLUDED.minecraft_username,duel_player_settings.minecraft_username), selected_kit=EXCLUDED.selected_kit, updated_at=NOW()`,[uuid,username,kit]);
    res.json({ok:true,kit});
  } catch(error){ console.error('[duel settings]',error); res.status(500).json({error:'Impossible de sauvegarder le kit affiché.'}); }
});

app.get('/api/duels/kits', async (_req,res) => {
  try {
    // Reconciliation aussi a la lecture : apres un redeploiement, un ancien kit fantome
    // disparait immediatement si le kits.yml stocke du Lobby ne le contient plus.
    await reconcileDuelKitsWithLobbyFile();
    const r=await query('SELECT kit_key AS key, display_name AS name, icon_material AS icon, emoji, sort_order FROM duel_kits WHERE active=TRUE ORDER BY sort_order, display_name');
    res.json({kits:r.rows, tiers:duelTierThresholds});
  }
  catch(error){ console.error('[duels kits]',error); res.status(500).json({error:'Impossible de charger les kits.'}); }
});

app.get('/api/duels/player', async (req,res) => {
  try { const data=await duelPlayerPayload(req.query.player); if(!data) return res.status(404).json({error:'Joueur introuvable dans les statistiques de duel.'}); res.json(data); }
  catch(error){ console.error('[duels player]',error); res.status(500).json({error:'Impossible de charger le profil duel.'}); }
});

app.get('/api/duels/leaderboard', async (req,res) => {
  const kitRaw=String(req.query.kit||'overall');
  const limit=Math.min(100,Math.max(10,Number(req.query.limit||50)));
  try {
    const ctes=duelIdentityCtesSql();
    let rows;
    if(kitRaw==='overall') {
      rows=(await query(`
        WITH ${ctes}, all_kit_stats AS (
          SELECT i.identity_key,i.minecraft_uuid,i.minecraft_username,k.kit_key,
                 COALESCE(s.elo,300)::int AS elo,COALESCE(s.wins,0)::int AS wins,
                 COALESCE(s.losses,0)::int AS losses,COALESCE(s.kills,0)::int AS kills,COALESCE(s.deaths,0)::int AS deaths
          FROM identities i CROSS JOIN (SELECT * FROM duel_kits WHERE active=TRUE) k
          LEFT JOIN best_stats s ON s.identity_key=i.identity_key AND s.kit_key=k.kit_key
        ), agg AS (
          SELECT identity_key,minecraft_uuid,minecraft_username,COALESCE(ROUND(AVG(elo))::int,300) AS elo,
                 COALESCE(SUM(wins),0)::int AS wins,COALESCE(SUM(losses),0)::int AS losses,
                 COALESCE(SUM(kills),0)::int AS kills,COALESCE(SUM(deaths),0)::int AS deaths
          FROM all_kit_stats
          GROUP BY identity_key,minecraft_uuid,minecraft_username
        ), ranked AS (
          SELECT *,RANK() OVER (ORDER BY elo DESC,wins DESC,losses ASC) AS placement FROM agg
        ) SELECT * FROM ranked ORDER BY placement,minecraft_username LIMIT $1`,[limit])).rows;
    } else {
      const kit=normalizeKitKey(kitRaw);
      if(!kit) return res.status(400).json({error:'Kit invalide.'});
      const exists=await query('SELECT 1 FROM duel_kits WHERE kit_key=$1 AND active=TRUE',[kit]);
      if(!exists.rowCount) return res.status(404).json({error:'Kit inconnu.'});
      rows=(await query(`
        WITH ${ctes}, base AS (
          SELECT i.identity_key,i.minecraft_uuid,i.minecraft_username,
                 COALESCE(s.elo,300)::int AS elo,COALESCE(s.wins,0)::int AS wins,
                 COALESCE(s.losses,0)::int AS losses,COALESCE(s.kills,0)::int AS kills,COALESCE(s.deaths,0)::int AS deaths
          FROM identities i LEFT JOIN best_stats s ON s.identity_key=i.identity_key AND s.kit_key=$1
        ), ranked AS (
          SELECT *,RANK() OVER (ORDER BY elo DESC,wins DESC,losses ASC) AS placement FROM base
        ) SELECT * FROM ranked ORDER BY placement,minecraft_username LIMIT $2`,[kit,limit])).rows;
    }

    const identityKeys=rows.map((r)=>r.identity_key);
    let badges=[];
    if(identityKeys.length) badges=(await query(`
      WITH ${ctes}, ids AS (SELECT UNNEST($1::text[]) AS identity_key)
      SELECT ids.identity_key,k.kit_key,k.display_name,k.icon_material,k.emoji,k.sort_order,COALESCE(s.elo,300)::int AS elo
      FROM ids CROSS JOIN (SELECT * FROM duel_kits WHERE active=TRUE) k
      LEFT JOIN best_stats s ON s.identity_key=ids.identity_key AND s.kit_key=k.kit_key
      ORDER BY ids.identity_key,k.sort_order,k.display_name`,[identityKeys])).rows;
    const byPlayer=new Map();
    for(const b of badges){
      if(!byPlayer.has(b.identity_key)) byPlayer.set(b.identity_key,[]);
      byPlayer.get(b.identity_key).push({kit:b.kit_key,name:b.display_name,icon:b.icon_material,emoji:b.emoji,elo:Number(b.elo),tier:duelTier(b.elo)});
    }
    res.json({kit:kitRaw,entries:rows.map((r)=>(
      {position:Number(r.placement||0),uuid:r.minecraft_uuid,username:r.minecraft_username,elo:Number(r.elo),tier:duelTier(r.elo),wins:Number(r.wins),losses:Number(r.losses),kills:Number(r.kills),deaths:Number(r.deaths),kdr:duelKdr(r.kills,r.deaths),kits:byPlayer.get(r.identity_key)||[]}
    ))});
  } catch(error){ console.error('[duels leaderboard]',error); res.status(500).json({error:'Impossible de charger le leaderboard.'}); }
});

app.get('/api/account/duels', requireAuth, async (req,res) => {
  try { const me=await getCurrentUser(req.session.discordId); if(!me?.minecraft_uuid) return res.json({linked:false}); const data=await duelPlayerPayload(me.minecraft_uuid); res.json({linked:true, data}); }
  catch(error){ console.error('[account duels]',error); res.status(500).json({error:'Impossible de charger tes statistiques de duel.'}); }
});

app.post('/api/account/duels/settings', requireAuth, sensitiveLimiter, async (req,res) => {
  try { const me=await getCurrentUser(req.session.discordId); if(!me?.minecraft_uuid) return res.status(400).json({error:'Compte Minecraft non lié.'}); const kit=normalizeKitKey(req.body?.kit); if(!kit) return res.status(400).json({error:'Kit invalide.'});
    const exists=await query('SELECT 1 FROM duel_kits WHERE kit_key=$1 AND active=TRUE',[kit]); if(!exists.rowCount) return res.status(404).json({error:'Kit inconnu.'});
    await query(`INSERT INTO duel_player_settings(minecraft_uuid,minecraft_username,selected_kit,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(minecraft_uuid) DO UPDATE SET minecraft_username=EXCLUDED.minecraft_username,selected_kit=EXCLUDED.selected_kit,updated_at=NOW()`,[me.minecraft_uuid,me.minecraft_username,kit]);
    res.json({ok:true,kit});
  } catch(error){ console.error('[account duel settings]',error); res.status(500).json({error:'Impossible de sauvegarder ton kit affiché.'}); }
});

// ---- Inventaire Survie / Ender Chest ----
app.post('/api/minecraft/game-sync', requireMinecraftSecret, minecraftSyncLimiter, async (req,res) => {
  try {
    const uuid=normalizeUuid(req.body?.uuid);
    if(!uuid) return res.status(400).json({error:'UUID invalide.'});
    const expectedWorld=String(process.env.MINECRAFT_SURVIVAL_WORLD||'world').trim().toLowerCase();
    const sourceWorld=String(req.body?.source_world||'').trim().toLowerCase();
    if(sourceWorld!==expectedWorld) return res.status(409).json({error:`Seul l'inventaire du monde ${expectedWorld} peut être synchronisé.`});
    const username=String(req.body?.username||uuid).slice(0,32);
    const source=String(req.body?.source_server||'Lobby').slice(0,64);
    const inventory=Array.isArray(req.body?.inventory)?req.body.inventory.slice(0,60):[];
    const armor=Array.isArray(req.body?.armor)?req.body.armor.slice(0,8):[];
    const ender=Array.isArray(req.body?.ender_chest)?req.body.ender_chest.slice(0,40):[];
    const offhand=req.body?.offhand && typeof req.body.offhand==='object'?req.body.offhand:null;
    await query(`INSERT INTO minecraft_game_data(minecraft_uuid,minecraft_username,source_server,inventory,armor,offhand,ender_chest,updated_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,NOW()) ON CONFLICT(minecraft_uuid) DO UPDATE SET minecraft_username=EXCLUDED.minecraft_username,source_server=EXCLUDED.source_server,inventory=EXCLUDED.inventory,armor=EXCLUDED.armor,offhand=EXCLUDED.offhand,ender_chest=EXCLUDED.ender_chest,updated_at=NOW()`,[uuid,username,source,JSON.stringify(inventory),JSON.stringify(armor),JSON.stringify(offhand),JSON.stringify(ender)]);
    res.json({ok:true,world:expectedWorld});
  } catch(error){ console.error('[game sync]',error); res.status(500).json({error:'Synchronisation inventaire impossible.'}); }
});

app.get('/api/account/game-data', requireAuth, async (req,res) => {
  try {
    const me=await getCurrentUser(req.session.discordId); if(!me?.minecraft_uuid) return res.json({linked:false});
    const r=await query('SELECT minecraft_username,source_server,inventory,armor,offhand,ender_chest,updated_at FROM minecraft_game_data WHERE minecraft_uuid=$1',[me.minecraft_uuid]);
    const data=r.rows[0]||null;
    if(data) data.source_world=String(process.env.MINECRAFT_SURVIVAL_WORLD||'world');
    res.json({linked:true,data});
  }
  catch(error){ console.error('[account game data]',error); res.status(500).json({error:'Impossible de charger ton inventaire.'}); }
});

app.get('/api/shop/categories', async (_req, res) => {
  try {
    res.json(await fetchStripeShopProducts());
  } catch (error) {
    console.error('[Stripe products]', error.message);
    res.status(503).json({ error: 'Boutique Stripe non configurée ou indisponible.' });
  }
});

app.post('/api/shop/checkout', requireAuth, sensitiveLimiter, async (req, res) => {
  try {
    const rankKey = String(req.body?.rank || '').trim().toLowerCase();
    const rank = paidRankByKey(rankKey);
    if (!rank || !rank.priceId) return res.status(400).json({ error: 'Produit invalide ou non configuré.' });

    const user = await getCurrentUser(req.session.discordId);
    if (!user?.minecraft_username || !user?.minecraft_uuid) {
      return res.status(409).json({ error: 'Lie d’abord ton compte Minecraft depuis la page Compte.' });
    }

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('managed_payments[enabled]', 'true');
    form.set('line_items[0][price]', rank.priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('client_reference_id', String(user.discord_id));
    form.set('metadata[trizone_rank]', rank.key);
    form.set('metadata[trizone_price_id]', rank.priceId);
    form.set('metadata[trizone_discord_id]', String(user.discord_id));
    form.set('metadata[trizone_minecraft_uuid]', String(user.minecraft_uuid));
    form.set('metadata[trizone_minecraft_username]', String(user.minecraft_username));
    form.set('success_url', `${BASE_URL}/account.html?payment=success&session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url', `${BASE_URL}/shop.html?payment=cancel`);
    form.set('locale', 'auto');
    form.set('origin_context', 'web');

    const session = await stripeApi('POST', '/checkout/sessions', form);
    if (!session?.url) throw new Error('Stripe n’a pas renvoyé de lien Checkout.');
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Stripe checkout]', error);
    const message = error?.stripe?.code === 'resource_missing'
      ? 'Price ID Stripe introuvable. Vérifie les variables STRIPE_PRICE_*_ID.'
      : 'Erreur lors de la création du paiement Stripe.';
    res.status(error?.status === 400 ? 400 : 502).json({ error: message });
  }
});

app.post('/api/account/discord-rank/sync', requireAuth, sensitiveLimiter, async (req, res) => {
  try {
    const result = await syncDiscordPaidRank(req.session.discordId);
    if (result.reason === 'not_member') {
      return res.status(409).json({ error: 'Rejoins d’abord le serveur Discord Trizone, puis réessaie.' });
    }
    if (result.reason === 'no_roles_configured') {
      return res.status(503).json({ error: 'Les rôles de grades Discord ne sont pas encore configurés.' });
    }
    if (!result.synced) return res.status(400).json({ error: 'Impossible de synchroniser le rôle Discord.' });
    res.json({ ok: true, rank: result.rank });
  } catch (error) {
    console.error('[Discord rank manual sync]', error);
    res.status(502).json({ error: 'Trizone-bot n’a pas pu modifier le rôle. Vérifie ses permissions et la hiérarchie des rôles.' });
  }
});


app.post('/api/account/minecraft-rank/sync', requireAuth, sensitiveLimiter, async (req, res) => {
  try {
    const result = await enqueueMinecraftRankSync(req.session.discordId, 'manual_account_sync');
    if (!result.queued) return res.status(409).json({ error: 'Aucun compte Minecraft lié.' });
    res.json({ ok: true, rank: result.rank, deliveryId: result.id });
  } catch (error) {
    console.error('[Minecraft rank manual sync]', error);
    res.status(500).json({ error: 'Impossible de préparer la synchronisation Minecraft.' });
  }
});

app.get('/api/account/purchases', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT checkout_session_id, payment_intent_id, rank_key, price_id,
              amount_total, currency, payment_status, active, purchased_at, updated_at
       FROM stripe_orders
       WHERE discord_id = $1
       ORDER BY purchased_at DESC
       LIMIT 50`,
      [req.session.discordId]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('[purchases]', error);
    res.status(500).json({ error: 'Impossible de charger l’historique.' });
  }
});


app.get('/api/admin/duels/kits/order', requireAdmin, async (_req, res) => {
  try {
    const result = await query(`SELECT kit_key AS key,display_name AS name,icon_material AS icon,emoji,sort_order
      FROM duel_kits WHERE active=TRUE ORDER BY sort_order,display_name`);
    res.json({ kits: result.rows });
  } catch (error) {
    console.error('[admin duel kit order GET]', error);
    res.status(500).json({ error: 'Impossible de charger l ordre des kits.' });
  }
});

app.put('/api/admin/duels/kits/order', requireAdmin, sensitiveLimiter, async (req, res) => {
  try {
    const order = await applyDuelKitOrder(req.body?.order);
    const result = await query(`SELECT kit_key AS key,display_name AS name,icon_material AS icon,emoji,sort_order
      FROM duel_kits WHERE active=TRUE ORDER BY sort_order,display_name`);
    res.json({ ok: true, order, kits: result.rows });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Ordre invalide.' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const [users, linked, payments, banned] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM users'),
    query('SELECT COUNT(*)::int AS count FROM minecraft_accounts'),
    query("SELECT COUNT(*)::int AS count FROM stripe_orders WHERE active = TRUE OR payment_status IN ('paid','refunded')"),
    query('SELECT COUNT(*)::int AS count FROM users WHERE banned = TRUE'),
  ]);
  res.json({
    users: users.rows[0].count,
    linked: linked.rows[0].count,
    payments: payments.rows[0].count,
    banned: banned.rows[0].count,
  });
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const result = await query(
    `SELECT u.discord_id, u.discord_username, u.discord_global_name, u.created_at, u.last_login_at, u.banned,
            m.minecraft_username, m.minecraft_uuid, m.minecraft_rank, m.linked_at, m.updated_at
     FROM users u LEFT JOIN minecraft_accounts m ON m.discord_id = u.discord_id
     ORDER BY u.created_at DESC LIMIT 500`
  );
  res.json({ data: result.rows });
});

app.put('/api/admin/users/:discordId', requireAdmin, sensitiveLimiter, async (req, res) => {
  try {
    const discordId = String(req.params.discordId || '').trim();
    if (!/^\d{15,22}$/.test(discordId)) return res.status(400).json({ error: 'Discord ID invalide.' });

    if (typeof req.body?.banned === 'boolean') {
      if (discordId === String(req.session.discordId) && req.body.banned) return res.status(400).json({ error: 'Tu ne peux pas bannir ton propre compte admin.' });
      await query('UPDATE users SET banned = $2 WHERE discord_id = $1', [discordId, req.body.banned]);
    }
    if (req.body?.minecraft_rank != null) {
      const rank = normalizeRank(req.body.minecraft_rank);
      const updated = await query('UPDATE minecraft_accounts SET minecraft_rank = $2, updated_at = NOW() WHERE discord_id = $1', [discordId, rank]);
      if (!updated.rowCount) return res.status(409).json({ error: 'Ce joueur n’a pas encore lié son compte Minecraft.' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[admin user update]', error);
    res.status(500).json({ error: 'Impossible de modifier ce joueur.' });
  }
});

app.delete('/api/admin/users/:discordId/minecraft', requireAdmin, sensitiveLimiter, async (req, res) => {
  const discordId = String(req.params.discordId || '').trim();
  if (!/^\d{15,22}$/.test(discordId)) return res.status(400).json({ error: 'Discord ID invalide.' });
  await query('DELETE FROM minecraft_accounts WHERE discord_id = $1', [discordId]);
  res.json({ ok: true });
});

function sanitizeConsoleLine(value) {
  return String(value ?? '').replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '').slice(0, 12000);
}

function consoleSseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/api/admin/servers', requireAdmin, async (_req, res) => {
  const servers = [];
  for (const server of minecraftServerConfigs()) {
    try {
      const status = await readCalagopusStatus(server.serverId, server.label, { kind: 'admin' });
      const mapped = stateFromCalagopus(status, { treatStartingAsOnline: server.id === 'proxy' });
      servers.push({
        id: server.id,
        name: server.label,
        description: server.description,
        configured: status.configured,
        state: mapped.state,
        state_label: mapped.label,
        raw_state: status.state,
        cpu_percent: status.cpu_percent,
        memory_bytes: status.memory_bytes,
        memory_limit_bytes: status.memory_limit_bytes,
        uptime_ms: status.uptime_ms,
      });
    } catch (error) {
      servers.push({ id: server.id, name: server.label, description: server.description, configured: Boolean(server.serverId), state: 'down', state_label: 'Indisponible', error: error.message });
    }
  }
  res.json({ data: servers });
});

app.post('/api/admin/servers/:id/command', requireAdmin, sensitiveLimiter, async (req, res) => {
  const server = findMinecraftServer(req.params.id);
  if (!server || !server.serverId) return res.status(404).json({ error: 'Serveur Calagopus introuvable.' });
  const command = String(req.body?.command || '').trim();
  if (!command || command.length > 1000 || /[\r\n\0]/.test(command)) return res.status(400).json({ error: 'Commande invalide.' });
  try {
    await calagopusRequest(`/api/client/servers/${encodeURIComponent(server.serverId)}/command`, {
      kind: 'admin', method: 'POST', body: { command },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error(`[Calagopus command] ${server.id}:`, error.message);
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post('/api/admin/servers/:id/power', requireAdmin, sensitiveLimiter, async (req, res) => {
  const server = findMinecraftServer(req.params.id);
  if (!server || !server.serverId) return res.status(404).json({ error: 'Serveur Calagopus introuvable.' });
  const signal = String(req.body?.signal || '').toLowerCase();
  if (!['start', 'stop', 'restart'].includes(signal)) return res.status(400).json({ error: 'Action invalide.' });
  try {
    await calagopusRequest(`/api/client/servers/${encodeURIComponent(server.serverId)}/power`, {
      kind: 'admin', method: 'POST', body: { signal },
    });
    calagopusCache.delete(`admin:${server.serverId}`);
    calagopusCache.delete(`status:${server.serverId}`);
    res.json({ ok: true, signal });
  } catch (error) {
    console.error(`[Calagopus power] ${server.id}:`, error.message);
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.get('/api/admin/servers/:id/console-stream', requireAdmin, async (req, res) => {
  const server = findMinecraftServer(req.params.id);
  if (!server || !server.serverId) return res.status(404).json({ error: 'Serveur Calagopus introuvable.' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  consoleSseSend(res, 'state', { state: 'connecting', label: 'Connexion à Calagopus…' });

  let socket = null;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    if (socket) {
      try { socket.close(); } catch {}
    }
  };

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 20_000);
  res.on('close', cleanup);

  try {
    const wsPayload = await calagopusRequest(`/api/client/servers/${encodeURIComponent(server.serverId)}/websocket`, { kind: 'admin' });
    const data = wsPayload?.data?.attributes || wsPayload?.data || wsPayload?.attributes || wsPayload || {};
    const token = String(data.token || '');
    const socketUrl = String(data.socket || data.url || '');
    if (!token || !/^wss?:\/\//i.test(socketUrl)) throw new Error('Calagopus n’a pas renvoyé de WebSocket valide.');

    socket = new WebSocket(socketUrl, { handshakeTimeout: 7000 });
    socket.on('open', () => {
      socket.send(JSON.stringify({ event: 'auth', args: [token] }));
      consoleSseSend(res, 'state', { state: 'connected', label: `Console ${server.label} connectée` });
    });
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      const event = String(message?.event || '');
      const args = Array.isArray(message?.args) ? message.args : [];
      if (event === 'console output') {
        for (const line of args) consoleSseSend(res, 'console', { line: sanitizeConsoleLine(line) });
      } else if (event === 'status') {
        consoleSseSend(res, 'server-state', { state: String(args[0] || '') });
      } else if (event === 'stats') {
        try {
          const stats = typeof args[0] === 'string' ? JSON.parse(args[0]) : args[0];
          consoleSseSend(res, 'stats', stats || {});
        } catch {}
      } else if (event === 'token expiring' || event === 'token expired') {
        consoleSseSend(res, 'state', { state: 'reconnecting', label: 'Renouvellement de la console…' });
      }
    });
    socket.on('error', (error) => {
      if (!closed) consoleSseSend(res, 'error', { error: error.message || 'Erreur WebSocket Calagopus.' });
    });
    socket.on('close', () => {
      if (!closed) {
        consoleSseSend(res, 'state', { state: 'closed', label: 'Console déconnectée' });
        res.end();
      }
      cleanup();
    });
  } catch (error) {
    console.error(`[Calagopus console] ${server.id}:`, error.message);
    if (!closed) {
      consoleSseSend(res, 'error', { error: error.message });
      res.end();
    }
    cleanup();
  }
});

app.get('/api/admin/events', requireAdmin, async (_req, res) => {
  const result = await query(
    `SELECT event_id AS webhook_id, type, event_created_at AS event_date,
            data AS subject, processed, process_error, received_at
     FROM stripe_events ORDER BY received_at DESC LIMIT 150`
  );
  res.json({ data: result.rows });
});

app.put('/api/admin/site-config', requireAdmin, sensitiveLimiter, async (req, res) => {
  try {
    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return res.status(400).json({ error: 'Données invalides.' });

    const entries = [];
    for (const [key, raw] of Object.entries(values)) {
      const rule = SITE_SETTINGS[key];
      if (!rule) continue;
      let value = String(raw ?? '').trim().slice(0, rule.max);
      if (key.endsWith('_email') && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return res.status(400).json({ error: `Adresse e-mail invalide pour ${key}.` });
      }
      if (key === 'discord_invite_url' && value && !/^https:\/\//i.test(value)) {
        return res.status(400).json({ error: 'Le lien Discord doit commencer par https://.' });
      }
      entries.push([key, value]);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO site_settings(key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, value]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true, values: await getSiteConfig() });
  } catch (error) {
    console.error('[admin site config]', error);
    res.status(500).json({ error: error.message || 'Impossible d’enregistrer le site.' });
  }
});

// Compatibilité avec l’ancienne version du panel.
app.put('/api/admin/announcement', requireAdmin, sensitiveLimiter, async (req, res) => {
  const value = String(req.body?.value || '').trim().slice(0, SITE_SETTINGS.announcement.max);
  await query(
    `INSERT INTO site_settings(key, value, updated_at)
     VALUES ('announcement', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [value]
  );
  res.json({ ok: true, value });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable.' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

initDatabase()
  .then(() => app.listen(PORT, () => {
    console.log(`Trizone site Calagopus lancé sur ${BASE_URL} (port ${PORT})`);
    sampleCalagopusStatuses().catch((error) => console.warn('[status sampler]', error.message));
    setInterval(() => sampleCalagopusStatuses().catch((error) => console.warn('[status sampler]', error.message)), STATUS_SAMPLE_INTERVAL_MS).unref();
  }))
  .catch((error) => {
    console.error('Impossible d’initialiser la base de données:', error);
    process.exit(1);
  });
