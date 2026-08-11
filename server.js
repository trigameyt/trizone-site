require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { rateLimit } = require('express-rate-limit');
const { pool, query, initDatabase } = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://*.tebex.io', 'https://*.tebexcdn.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://*.tebex.io'],
    },
  },
}));

app.use(cookieSession({
  name: 'trizone_session',
  keys: [process.env.SESSION_SECRET || 'dev-only-change-me'],
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 14,
}));

const sensitiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
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

// IMPORTANT: route raw AVANT express.json() pour vérifier la signature Tebex.
app.post('/api/tebex/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const secret = process.env.TEBEX_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook Tebex non configuré.' });

    const raw = req.body;
    const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');
    const expected = crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');
    const received = req.get('X-Signature');

    if (!safeEqualHex(expected, received)) {
      return res.status(401).json({ error: 'Signature invalide.' });
    }

    const payload = JSON.parse(raw.toString('utf8'));

    if (payload.type === 'validation.webhook') {
      return res.status(200).json({ id: payload.id });
    }

    await query(
      `INSERT INTO tebex_events(webhook_id, type, event_date, subject)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (webhook_id) DO NOTHING`,
      [payload.id, payload.type || 'unknown', payload.date || null, JSON.stringify(payload.subject || {})]
    );

    res.status(204).end();
  } catch (error) {
    console.error('[Tebex webhook]', error);
    res.status(500).json({ error: 'Erreur webhook.' });
  }
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));

function adminIds() {
  return new Set(
    String(process.env.ADMIN_DISCORD_IDS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

function isAdminId(id) {
  return adminIds().has(String(id));
}

function requireAuth(req, res, next) {
  if (!req.session?.discordId) return res.status(401).json({ error: 'Connexion Discord requise.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.discordId) return res.status(401).json({ error: 'Connexion requise.' });
  if (!isAdminId(req.session.discordId)) return res.status(403).json({ error: 'Accès administrateur requis.' });
  next();
}

function discordAvatarUrl(user) {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

async function getCurrentUser(discordId) {
  const result = await query(
    `SELECT u.discord_id, u.discord_username, u.discord_global_name, u.discord_avatar,
            u.created_at, u.last_login_at, u.banned,
            m.minecraft_uuid, m.minecraft_username, m.linked_at
     FROM users u
     LEFT JOIN minecraft_accounts m ON m.discord_id = u.discord_id
     WHERE u.discord_id = $1`,
    [discordId]
  );
  return result.rows[0] || null;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'trizone-site' }));

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
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', sensitiveLimiter, async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session?.oauthState) {
      return res.status(400).send('État OAuth Discord invalide.');
    }

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

app.post('/api/minecraft/link/confirm', sensitiveLimiter, async (req, res) => {
  try {
    const expected = process.env.MINECRAFT_LINK_SECRET || '';
    const received = req.get('X-Trizone-Secret') || '';
    if (!expected || expected.length < 16 || received !== expected) {
      return res.status(401).json({ error: 'Secret serveur invalide.' });
    }

    const code = String(req.body?.code || '').trim();
    const uuid = String(req.body?.uuid || '').trim();
    const username = String(req.body?.username || '').trim();

    if (!/^\d{6}$/.test(code) || !/^[0-9a-fA-F-]{32,36}$/.test(uuid) || !/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      return res.status(400).json({ error: 'Données invalides.' });
    }

    const found = await query(
      `SELECT discord_id FROM link_codes
       WHERE code = $1 AND expires_at > NOW()`,
      [code]
    );

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
        `INSERT INTO minecraft_accounts(discord_id, minecraft_uuid, minecraft_username, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           minecraft_uuid = EXCLUDED.minecraft_uuid,
           minecraft_username = EXCLUDED.minecraft_username,
           updated_at = NOW()`,
        [discordId, uuid, username]
      );
      await client.query('DELETE FROM link_codes WHERE code = $1', [code]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true, message: `Compte ${username} lié avec succès.` });
  } catch (error) {
    console.error('[minecraft link]', error);
    res.status(500).json({ error: 'Erreur lors de la liaison.' });
  }
});

let shopCache = { expires: 0, data: null };

async function fetchTebexCategories() {
  const token = process.env.TEBEX_WEBSTORE_TOKEN;
  if (!token) throw new Error('TEBEX_WEBSTORE_TOKEN non configuré.');

  if (shopCache.data && Date.now() < shopCache.expires) return shopCache.data;

  const response = await fetch(`https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}/categories?includePackages=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Tebex categories HTTP ${response.status}`);
  const json = await response.json();
  shopCache = { data: json, expires: Date.now() + 60_000 };
  return json;
}

app.get('/api/shop/categories', async (_req, res) => {
  try {
    const data = await fetchTebexCategories();
    res.json(data);
  } catch (error) {
    console.error('[Tebex categories]', error.message);
    res.status(503).json({ error: 'Boutique Tebex non configurée ou indisponible.' });
  }
});

function requestIpv4(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || '';
  const cleaned = ip.replace(/^::ffff:/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned) ? cleaned : undefined;
}

app.post('/api/shop/checkout', requireAuth, sensitiveLimiter, async (req, res) => {
  try {
    const packageId = Number(req.body?.packageId);
    if (!Number.isInteger(packageId) || packageId <= 0) return res.status(400).json({ error: 'Produit invalide.' });

    const user = await getCurrentUser(req.session.discordId);
    if (!user?.minecraft_username) {
      return res.status(409).json({ error: 'Lie d’abord ton compte Minecraft depuis la page Compte.' });
    }

    const token = process.env.TEBEX_WEBSTORE_TOKEN;
    if (!token) return res.status(503).json({ error: 'Tebex non configuré.' });

    const basketBody = {
      complete_url: `${BASE_URL}/account.html?payment=success`,
      cancel_url: `${BASE_URL}/shop.html?payment=cancel`,
      complete_auto_redirect: true,
      username: user.minecraft_username,
      custom: {
        trizone_discord_id: user.discord_id,
        trizone_minecraft_uuid: user.minecraft_uuid,
      },
    };

    const ipv4 = requestIpv4(req);
    if (ipv4) basketBody.ip_address = ipv4;

    const basketResponse = await fetch(`https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}/baskets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(basketBody),
    });

    const basketJson = await basketResponse.json().catch(() => ({}));
    if (!basketResponse.ok) {
      console.error('[Tebex basket]', basketResponse.status, basketJson);
      return res.status(502).json({ error: 'Tebex a refusé la création du panier.' });
    }

    const basket = basketJson.data || basketJson;
    const ident = basket.ident;
    if (!ident) return res.status(502).json({ error: 'Panier Tebex invalide.' });

    const addResponse = await fetch(`https://headless.tebex.io/api/baskets/${encodeURIComponent(ident)}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ package_id: packageId, quantity: 1 }),
    });
    const updated = await addResponse.json().catch(() => ({}));
    if (!addResponse.ok) {
      console.error('[Tebex add package]', addResponse.status, updated);
      return res.status(502).json({ error: 'Impossible d’ajouter ce produit au panier.' });
    }

    const checkoutUrl = updated?.links?.checkout || basket?.links?.checkout;
    let authUrl = null;

    try {
      const returnUrl = `${BASE_URL}/api/shop/auth-return?basket=${encodeURIComponent(ident)}`;
      const authResponse = await fetch(
        `https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}/baskets/${encodeURIComponent(ident)}/auth?returnUrl=${encodeURIComponent(returnUrl)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (authResponse.ok) {
        const auth = await authResponse.json();
        const links = Array.isArray(auth) ? auth : (auth.data || []);
        authUrl = links?.[0]?.url || null;
      }
    } catch (error) {
      console.warn('[Tebex auth optional]', error.message);
    }

    res.json({ url: authUrl || checkoutUrl, basket: ident });
  } catch (error) {
    console.error('[checkout]', error);
    res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
});

app.get('/api/shop/auth-return', async (req, res) => {
  try {
    const ident = String(req.query.basket || '');
    const token = process.env.TEBEX_WEBSTORE_TOKEN;
    if (!ident || !token) return res.redirect('/shop.html?payment=error');

    const response = await fetch(`https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}/baskets/${encodeURIComponent(ident)}`, {
      headers: { Accept: 'application/json' },
    });
    const json = await response.json().catch(() => ({}));
    const basket = json.data || json;
    const checkout = basket?.links?.checkout;
    if (!checkout) return res.redirect('/shop.html?payment=error');
    res.redirect(checkout);
  } catch (error) {
    console.error('[auth return]', error);
    res.redirect('/shop.html?payment=error');
  }
});

app.get('/api/account/purchases', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req.session.discordId);
    const events = await query(
      `SELECT webhook_id, type, event_date, subject, received_at
       FROM tebex_events
       WHERE type LIKE 'payment.%'
       ORDER BY received_at DESC
       LIMIT 200`
    );

    const discordId = String(user.discord_id);
    const mc = String(user.minecraft_username || '').toLowerCase();
    const matches = events.rows.filter((event) => {
      const raw = JSON.stringify(event.subject || {}).toLowerCase();
      return raw.includes(discordId.toLowerCase()) || (mc && raw.includes(mc));
    }).slice(0, 30);

    res.json({ data: matches });
  } catch (error) {
    console.error('[purchases]', error);
    res.status(500).json({ error: 'Impossible de charger l’historique.' });
  }
});

app.get('/api/announcement', async (_req, res) => {
  try {
    const result = await query("SELECT value, updated_at FROM site_settings WHERE key = 'announcement'");
    res.json({ value: result.rows[0]?.value || '', updated_at: result.rows[0]?.updated_at || null });
  } catch {
    res.json({ value: '' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const [users, linked, payments] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM users'),
    query('SELECT COUNT(*)::int AS count FROM minecraft_accounts'),
    query("SELECT COUNT(*)::int AS count FROM tebex_events WHERE type = 'payment.completed'"),
  ]);
  res.json({ users: users.rows[0].count, linked: linked.rows[0].count, payments: payments.rows[0].count });
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const result = await query(
    `SELECT u.discord_id, u.discord_username, u.discord_global_name, u.created_at, u.last_login_at, u.banned,
            m.minecraft_username, m.minecraft_uuid, m.linked_at
     FROM users u LEFT JOIN minecraft_accounts m ON m.discord_id = u.discord_id
     ORDER BY u.created_at DESC LIMIT 300`
  );
  res.json({ data: result.rows });
});

app.get('/api/admin/events', requireAdmin, async (_req, res) => {
  const result = await query(
    `SELECT webhook_id, type, event_date, subject, received_at
     FROM tebex_events ORDER BY received_at DESC LIMIT 150`
  );
  res.json({ data: result.rows });
});

app.put('/api/admin/announcement', requireAdmin, sensitiveLimiter, async (req, res) => {
  const value = String(req.body?.value || '').trim().slice(0, 500);
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
  .then(() => {
    app.listen(PORT, () => console.log(`Trizone site lancé sur ${BASE_URL} (port ${PORT})`));
  })
  .catch((error) => {
    console.error('Impossible d’initialiser la base de données:', error);
    process.exit(1);
  });
