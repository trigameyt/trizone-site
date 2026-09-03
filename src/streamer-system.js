'use strict';

const crypto = require('crypto');

const TWITCH_ID_BASE = 'https://id.twitch.tv/oauth2';
const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const DISCORD_API_BASE = 'https://discord.com/api/v10';

function installStreamerSystem({ app, query, baseUrl }) {
  if (!app || !query) throw new Error('installStreamerSystem: app et query sont requis.');

  const BASE_URL = String(baseUrl || process.env.BASE_URL || '').replace(/\/$/, '');
  let appTokenCache = { token: '', expiresAt: 0 };

  function env(name, fallback = '') {
    return String(process.env[name] ?? fallback).trim();
  }

  function twitchConfig() {
    return {
      clientId: env('TWITCH_CLIENT_ID'),
      clientSecret: env('TWITCH_CLIENT_SECRET'),
      redirectUri: env('TWITCH_REDIRECT_URI', `${BASE_URL}/auth/twitch/callback`),
      eventSubSecret: env('TWITCH_EVENTSUB_SECRET'),
      callbackUrl: env('TWITCH_EVENTSUB_CALLBACK_URL', `${BASE_URL}/webhooks/twitch/eventsub`),
    };
  }

  function discordConfig() {
    return {
      token: env('DISCORD_BOT_TOKEN'),
      guildId: env('DISCORD_GUILD_ID'),
      streamerRoleId: env('DISCORD_STREAMER_ROLE_ID'),
      liveRoleId: env('DISCORD_LIVE_ROLE_ID'),
      livePingRoleId: env('DISCORD_LIVE_PING_ROLE_ID'),
      notificationChannelId: env('DISCORD_STREAMER_NOTIFICATION_CHANNEL_ID'),
    };
  }

  function bridgeConfig() {
    return {
      key: env('STREAMER_BRIDGE_KEY'),
      presenceTtlSeconds: Math.max(30, Number(env('STREAMER_PRESENCE_TTL_SECONDS', '75')) || 75),
      announcementMinutes: Math.max(2, Number(env('STREAMER_ANNOUNCEMENT_TTL_MINUTES', '15')) || 15),
    };
  }

  function toMysqlDateTime(value) {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }
  function validSnowflake(value) {
    return /^\d{16,22}$/.test(String(value || ''));
  }

  function safeEqual(a, b) {
    const aa = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    if (aa.length !== bb.length || aa.length === 0) return false;
    return crypto.timingSafeEqual(aa, bb);
  }

  function requireDiscordUser(req, res, next) {
    if (!req.session?.discordId) {
      return res.status(401).json({ error: 'Connexion Discord requise.' });
    }
    next();
  }

  function requireBridge(req, res, next) {
    const cfg = bridgeConfig();
    const supplied = String(req.get('x-trizone-bridge-key') || '');
    if (!cfg.key || !safeEqual(supplied, cfg.key)) {
      return res.status(401).json({ error: 'Bridge non autorisé.' });
    }
    next();
  }

  async function readJsonResponse(response, label) {
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { raw: text.slice(0, 1200) }; }
    }
    if (!response.ok) {
      const detail = data?.message || data?.error || data?.raw || `HTTP ${response.status}`;
      const error = new Error(`${label}: ${detail}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function getTwitchAppToken(force = false) {
    const cfg = twitchConfig();
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('Twitch non configuré.');

    const now = Date.now();
    if (!force && appTokenCache.token && now < appTokenCache.expiresAt - 60_000) {
      return appTokenCache.token;
    }

    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetch(`${TWITCH_ID_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await readJsonResponse(response, 'Token Twitch App');
    appTokenCache = {
      token: String(data.access_token || ''),
      expiresAt: now + (Number(data.expires_in || 0) * 1000),
    };
    return appTokenCache.token;
  }

  async function exchangeTwitchCode(code) {
    const cfg = twitchConfig();
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: String(code || ''),
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    });
    const response = await fetch(`${TWITCH_ID_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return readJsonResponse(response, 'OAuth Twitch');
  }

  async function twitchHelix(pathname, { method = 'GET', body, token, retry401 = true } = {}) {
    const cfg = twitchConfig();
    const accessToken = token || await getTwitchAppToken();
    const response = await fetch(`${TWITCH_API_BASE}${pathname}`, {
      method,
      headers: {
        'Client-Id': cfg.clientId,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401 && !token && retry401) {
      await getTwitchAppToken(true);
      return twitchHelix(pathname, { method, body, retry401: false });
    }

    if (response.status === 204) return {};
    return readJsonResponse(response, `Twitch Helix ${pathname}`);
  }

  async function getTwitchIdentity(userToken) {
    const data = await twitchHelix('/users', { token: userToken });
    const user = Array.isArray(data.data) ? data.data[0] : null;
    if (!user) throw new Error('Impossible de lire le compte Twitch.');
    return {
      id: String(user.id),
      login: String(user.login || '').toLowerCase(),
      displayName: String(user.display_name || user.login || ''),
      profileImageUrl: String(user.profile_image_url || ''),
    };
  }

  async function getStream(userId, attempts = 1) {
    for (let i = 0; i < attempts; i += 1) {
      const data = await twitchHelix(`/streams?user_id=${encodeURIComponent(userId)}`);
      const stream = Array.isArray(data.data) ? data.data[0] : null;
      if (stream) {
        const thumbnail = String(stream.thumbnail_url || '')
          .replace('{width}', '1280')
          .replace('{height}', '720');
        return {
          id: String(stream.id || ''),
          userId: String(stream.user_id || userId),
          login: String(stream.user_login || '').toLowerCase(),
          displayName: String(stream.user_name || stream.user_login || ''),
          title: String(stream.title || ''),
          gameName: String(stream.game_name || ''),
          startedAt: stream.started_at || null,
          thumbnailUrl: thumbnail,
          viewerCount: Number(stream.viewer_count || 0),
        };
      }
      if (i + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1400));
    }
    return null;
  }

  async function createEventSub(type, twitchUserId) {
    const cfg = twitchConfig();
    if (!cfg.eventSubSecret || cfg.eventSubSecret.length < 10 || cfg.eventSubSecret.length > 100) {
      throw new Error('TWITCH_EVENTSUB_SECRET doit contenir entre 10 et 100 caractères.');
    }
    try {
      const data = await twitchHelix('/eventsub/subscriptions', {
        method: 'POST',
        body: {
          type,
          version: '1',
          condition: { broadcaster_user_id: String(twitchUserId) },
          transport: {
            method: 'webhook',
            callback: cfg.callbackUrl,
            secret: cfg.eventSubSecret,
          },
        },
      });
      return Array.isArray(data.data) ? String(data.data[0]?.id || '') : '';
    } catch (error) {
      if (error.status === 409) {
        console.warn(`[streamer] EventSub ${type} existe déjà pour ${twitchUserId}.`);
        return '';
      }
      throw error;
    }
  }

  async function deleteEventSub(id) {
    if (!id) return;
    try {
      await twitchHelix(`/eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`[streamer] Suppression EventSub ${id}: ${error.message}`);
    }
  }

  async function discordRequest(pathname, { method = 'GET', body } = {}) {
    const cfg = discordConfig();
    if (!cfg.token) throw new Error('DISCORD_BOT_TOKEN manquant.');
    const response = await fetch(`${DISCORD_API_BASE}${pathname}`, {
      method,
      headers: {
        Authorization: `Bot ${cfg.token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204) return {};
    return readJsonResponse(response, `Discord ${pathname}`);
  }

  async function setDiscordRole(discordId, roleId, enabled) {
    const cfg = discordConfig();
    if (!cfg.token || !validSnowflake(cfg.guildId) || !validSnowflake(discordId) || !validSnowflake(roleId)) {
      return false;
    }
    const path = `/guilds/${cfg.guildId}/members/${discordId}/roles/${roleId}`;
    await discordRequest(path, { method: enabled ? 'PUT' : 'DELETE' });
    return true;
  }

  async function sendDiscordLiveNotification(link, stream) {
    const cfg = discordConfig();
    if (!cfg.token || !validSnowflake(cfg.notificationChannelId)) return false;

    const twitchUrl = `https://www.twitch.tv/${encodeURIComponent(link.twitch_login || stream.login)}`;
    const ping = validSnowflake(cfg.livePingRoleId) ? `<@&${cfg.livePingRoleId}>` : '';
    const cacheBuster = `trizone=${Date.now()}`;
    const thumbnail = stream.thumbnailUrl
      ? `${stream.thumbnailUrl}${stream.thumbnailUrl.includes('?') ? '&' : '?'}${cacheBuster}`
      : '';

    const embed = {
      color: 0x9146ff,
      title: `🔴 ${link.twitch_display_name || stream.displayName || link.twitch_login} est en LIVE !`,
      url: twitchUrl,
      description: stream.title || 'Live Twitch en cours',
      thumbnail: link.twitch_profile_image_url ? { url: link.twitch_profile_image_url } : undefined,
      image: thumbnail ? { url: thumbnail } : undefined,
      fields: [
        ...(stream.gameName ? [{ name: 'Catégorie', value: stream.gameName, inline: true }] : []),
        ...(Number.isFinite(stream.viewerCount) ? [{ name: 'Spectateurs', value: String(stream.viewerCount), inline: true }] : []),
      ],
      footer: { text: 'Trizone • Twitch' },
      timestamp: new Date().toISOString(),
    };

    await discordRequest(`/channels/${cfg.notificationChannelId}/messages`, {
      method: 'POST',
      body: {
        content: ping || undefined,
        allowed_mentions: validSnowflake(cfg.livePingRoleId)
          ? { parse: [], roles: [cfg.livePingRoleId], users: [], replied_user: false }
          : { parse: [] },
        embeds: [embed],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 5,
            label: 'Regarder le live',
            url: twitchUrl,
          }],
        }],
      },
    });
    return true;
  }

  async function queueMinecraftAction(discordId, action) {
    const account = await query(
      `SELECT minecraft_uuid, minecraft_username
       FROM minecraft_accounts
       WHERE discord_id=$1
       LIMIT 1`,
      [discordId],
    );
    const mc = account.rows[0];
    if (!mc) return false;

    await query(
      `INSERT INTO streamer_minecraft_actions
       (discord_id,minecraft_uuid,minecraft_username,action,status,created_at)
       VALUES($1,$2,$3,$4,'pending',NOW())`,
      [discordId, mc.minecraft_uuid, mc.minecraft_username, action],
    );
    return true;
  }

  async function isMinecraftPlayerOnline(discordId) {
    const ttl = bridgeConfig().presenceTtlSeconds;
    const result = await query(
      `SELECT sp.minecraft_uuid
       FROM minecraft_accounts ma
       JOIN streamer_presence sp ON sp.minecraft_uuid=ma.minecraft_uuid
       WHERE ma.discord_id=$1
         AND sp.last_seen_at >= DATE_SUB(NOW(), INTERVAL ${ttl} SECOND)
       LIMIT 1`,
      [discordId],
    );
    return Boolean(result.rows[0]);
  }

  async function createLiveAnnouncement(link, stream) {
    if (!stream?.id) return null;

    const mcResult = await query(
      `SELECT minecraft_uuid, minecraft_username
       FROM minecraft_accounts
       WHERE discord_id=$1
       LIMIT 1`,
      [link.discord_id],
    );
    const mc = mcResult.rows[0];
    if (!mc) return null;

    const ttl = bridgeConfig().announcementMinutes;
    await query(
      `INSERT IGNORE INTO streamer_announcements
       (discord_id,twitch_user_id,stream_id,minecraft_uuid,minecraft_username,twitch_login,twitch_display_name,
        stream_title,stream_game_name,stream_thumbnail_url,twitch_url,discord_sent,created_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,NOW(),DATE_ADD(NOW(),INTERVAL ${ttl} MINUTE))`,
      [
        link.discord_id,
        link.twitch_user_id,
        stream.id,
        mc.minecraft_uuid,
        mc.minecraft_username,
        link.twitch_login,
        link.twitch_display_name,
        stream.title,
        stream.gameName,
        stream.thumbnailUrl,
        `https://www.twitch.tv/${link.twitch_login}`,
      ],
    );

    const rowResult = await query(
      `SELECT * FROM streamer_announcements WHERE stream_id=$1 LIMIT 1`,
      [stream.id],
    );
    const announcement = rowResult.rows[0];
    if (!announcement) return null;

    if (!announcement.discord_sent) {
      const claim = await query(
        `UPDATE streamer_announcements
         SET discord_claimed_at=NOW()
         WHERE id=$1
           AND discord_sent=FALSE
           AND (discord_claimed_at IS NULL OR discord_claimed_at < DATE_SUB(NOW(),INTERVAL 2 MINUTE))`,
        [announcement.id],
      );

      if (claim.rowCount) {
        try {
          await sendDiscordLiveNotification(link, stream);
          await query(
            `UPDATE streamer_announcements
             SET discord_sent=TRUE, discord_sent_at=NOW(), discord_claimed_at=NULL, discord_error=NULL
             WHERE id=$1`,
            [announcement.id],
          );
        } catch (error) {
          console.error('[streamer] Notification Discord:', error);
          await query(
            `UPDATE streamer_announcements
             SET discord_claimed_at=NULL, discord_error=$2
             WHERE id=$1`,
            [announcement.id, String(error.message || error).slice(0, 1000)],
          );
        }
      }
    }

    return announcement;
  }

  async function maybeAnnounceForDiscord(discordId) {
    const result = await query(
      `SELECT * FROM twitch_links WHERE discord_id=$1 AND stream_online=TRUE LIMIT 1`,
      [discordId],
    );
    const link = result.rows[0];
    if (!link) return false;

    const online = await isMinecraftPlayerOnline(discordId);
    if (!online) return false;

    const stream = await getStream(link.twitch_user_id, 6);
    if (!stream) {
      console.warn(`[streamer] Live Twitch detecte, donnees Helix pas encore disponibles pour ${link.twitch_user_id}.`);
      return false;
    }

    await query(
      `UPDATE twitch_links
       SET stream_id=$2, stream_title=$3, stream_game_name=$4,
           stream_thumbnail_url=$5, stream_started_at=$6, stream_viewer_count=$7,
           updated_at=NOW()
       WHERE discord_id=$1`,
      [discordId, stream.id, stream.title, stream.gameName, stream.thumbnailUrl, toMysqlDateTime(stream.startedAt), stream.viewerCount],
    );

    const existing = await query(
      `SELECT id, discord_sent FROM streamer_announcements WHERE stream_id=$1 LIMIT 1`,
      [stream.id],
    );
    if (existing.rows[0]?.discord_sent) return false;

    await createLiveAnnouncement(link, stream);
    return true;
  }

  async function maybeAnnounceForMinecraftUuid(uuid) {
    const result = await query(
      `SELECT tl.discord_id
       FROM minecraft_accounts ma
       JOIN twitch_links tl ON tl.discord_id=ma.discord_id
       WHERE ma.minecraft_uuid=$1 AND tl.stream_online=TRUE
       LIMIT 1`,
      [uuid],
    );
    if (!result.rows[0]) return false;
    return maybeAnnounceForDiscord(result.rows[0].discord_id);
  }

  async function processStreamOnline(event) {
    const twitchUserId = String(event?.broadcaster_user_id || '');
    if (!twitchUserId) return;

    const result = await query(
      `SELECT * FROM twitch_links WHERE twitch_user_id=$1 LIMIT 1`,
      [twitchUserId],
    );
    const link = result.rows[0];
    if (!link) return;

    const stream = await getStream(twitchUserId, 3) || {
      id: String(event.id || ''),
      login: String(event.broadcaster_user_login || link.twitch_login || ''),
      displayName: String(event.broadcaster_user_name || link.twitch_display_name || ''),
      title: '',
      gameName: '',
      thumbnailUrl: '',
      startedAt: event.started_at || null,
      viewerCount: 0,
    };

    await query(
      `UPDATE twitch_links
       SET stream_online=TRUE, stream_id=$2, stream_title=$3, stream_game_name=$4,
           stream_thumbnail_url=$5, stream_started_at=$6, stream_viewer_count=$7,
           last_event_at=NOW(), updated_at=NOW()
       WHERE twitch_user_id=$1`,
      [twitchUserId, stream.id, stream.title, stream.gameName, stream.thumbnailUrl, toMysqlDateTime(stream.startedAt), stream.viewerCount],
    );

    const cfg = discordConfig();
    if (validSnowflake(cfg.liveRoleId)) {
      try { await setDiscordRole(link.discord_id, cfg.liveRoleId, true); }
      catch (error) { console.warn('[streamer] Rôle Discord En Live:', error.message); }
    }

    await maybeAnnounceForDiscord(link.discord_id);
  }

  async function processStreamOffline(event) {
    const twitchUserId = String(event?.broadcaster_user_id || '');
    if (!twitchUserId) return;

    const result = await query(
      `SELECT * FROM twitch_links WHERE twitch_user_id=$1 LIMIT 1`,
      [twitchUserId],
    );
    const link = result.rows[0];
    if (!link) return;

    await query(
      `UPDATE twitch_links
       SET stream_online=FALSE, stream_id=NULL, stream_title=NULL, stream_game_name=NULL,
           stream_thumbnail_url=NULL, stream_started_at=NULL, stream_viewer_count=0,
           last_event_at=NOW(), updated_at=NOW()
       WHERE twitch_user_id=$1`,
      [twitchUserId],
    );

    const cfg = discordConfig();
    if (validSnowflake(cfg.liveRoleId)) {
      try { await setDiscordRole(link.discord_id, cfg.liveRoleId, false); }
      catch (error) { console.warn('[streamer] Retrait rôle Discord En Live:', error.message); }
    }
  }

  function verifyTwitchSignature(req) {
    const cfg = twitchConfig();
    if (!cfg.eventSubSecret) return false;

    const id = String(req.get('Twitch-Eventsub-Message-Id') || '');
    const timestamp = String(req.get('Twitch-Eventsub-Message-Timestamp') || '');
    const signature = String(req.get('Twitch-Eventsub-Message-Signature') || '');
    const raw = req.rawBody;

    if (!id || !timestamp || !signature || !Buffer.isBuffer(raw)) return false;
    const sentAt = Date.parse(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 10 * 60_000) return false;

    const expected = `sha256=${crypto.createHmac('sha256', cfg.eventSubSecret)
      .update(Buffer.concat([Buffer.from(id), Buffer.from(timestamp), raw]))
      .digest('hex')}`;
    return safeEqual(expected, signature);
  }

  app.get('/api/account/twitch', requireDiscordUser, async (req, res) => {
    try {
      const result = await query(
        `SELECT tl.twitch_user_id,tl.twitch_login,tl.twitch_display_name,tl.twitch_profile_image_url,
                tl.linked_at,tl.stream_online,tl.stream_id,tl.stream_title,tl.stream_game_name,
                tl.stream_thumbnail_url,tl.stream_started_at,tl.stream_viewer_count,
                ma.minecraft_uuid,ma.minecraft_username
         FROM twitch_links tl
         LEFT JOIN minecraft_accounts ma ON ma.discord_id=tl.discord_id
         WHERE tl.discord_id=$1
         LIMIT 1`,
        [req.session.discordId],
      );
      const row = result.rows[0];
      if (!row) return res.json({ linked: false });

      res.json({
        linked: true,
        twitch: {
          id: row.twitch_user_id,
          login: row.twitch_login,
          display_name: row.twitch_display_name,
          profile_image_url: row.twitch_profile_image_url,
          linked_at: row.linked_at,
          live: Boolean(row.stream_online),
          stream: row.stream_online ? {
            id: row.stream_id,
            title: row.stream_title,
            game_name: row.stream_game_name,
            thumbnail_url: row.stream_thumbnail_url,
            started_at: row.stream_started_at,
            viewer_count: Number(row.stream_viewer_count || 0),
          } : null,
        },
        minecraft: row.minecraft_uuid ? {
          uuid: row.minecraft_uuid,
          username: row.minecraft_username,
        } : null,
      });
    } catch (error) {
      console.error('[streamer] GET account twitch:', error);
      res.status(500).json({ error: 'Impossible de lire la liaison Twitch.' });
    }
  });

  app.get('/auth/twitch', requireDiscordUser, (req, res) => {
    const cfg = twitchConfig();
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      return res.status(503).send('Twitch OAuth non configuré.');
    }

    const state = crypto.randomBytes(24).toString('hex');
    req.session.twitchOauthState = state;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: 'user:read:email',
      state,
    });
    res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
  });

  app.get('/auth/twitch/callback', async (req, res) => {
    try {
      if (!req.session?.discordId) return res.redirect('/account.html?twitch=login_required');

      const expectedState = String(req.session.twitchOauthState || '');
      delete req.session.twitchOauthState;
      const receivedState = String(req.query.state || '');
      if (!expectedState || !safeEqual(expectedState, receivedState)) {
        return res.status(400).send('État OAuth Twitch invalide.');
      }
      if (req.query.error) {
        return res.redirect(`/account.html?twitch=${encodeURIComponent(String(req.query.error))}`);
      }

      const token = await exchangeTwitchCode(req.query.code);
      const identity = await getTwitchIdentity(token.access_token);
      const discordId = req.session.discordId;

      const conflict = await query(
        `SELECT discord_id FROM twitch_links WHERE twitch_user_id=$1 AND discord_id<>$2 LIMIT 1`,
        [identity.id, discordId],
      );
      if (conflict.rows[0]) {
        return res.status(409).send('Ce compte Twitch est déjà lié à un autre compte Trizone.');
      }

      const previous = await query(
        `SELECT * FROM twitch_links WHERE discord_id=$1 LIMIT 1`,
        [discordId],
      );
      if (previous.rows[0]?.twitch_user_id && previous.rows[0].twitch_user_id !== identity.id) {
        await deleteEventSub(previous.rows[0].eventsub_online_id);
        await deleteEventSub(previous.rows[0].eventsub_offline_id);
      }

      await query(
        `INSERT INTO twitch_links
         (discord_id,twitch_user_id,twitch_login,twitch_display_name,twitch_profile_image_url,linked_at,updated_at)
         VALUES($1,$2,$3,$4,$5,NOW(),NOW())
         ON DUPLICATE KEY UPDATE
           twitch_user_id=VALUES(twitch_user_id),
           twitch_login=VALUES(twitch_login),
           twitch_display_name=VALUES(twitch_display_name),
           twitch_profile_image_url=VALUES(twitch_profile_image_url),
           linked_at=NOW(),
           updated_at=NOW()`,
        [discordId, identity.id, identity.login, identity.displayName, identity.profileImageUrl],
      );

      const cfg = discordConfig();
      if (validSnowflake(cfg.streamerRoleId)) {
        try { await setDiscordRole(discordId, cfg.streamerRoleId, true); }
        catch (error) { console.warn('[streamer] Rôle Discord Streamer:', error.message); }
      }
      await queueMinecraftAction(discordId, 'add');

      let onlineSub = '';
      let offlineSub = '';
      try { onlineSub = await createEventSub('stream.online', identity.id); }
      catch (error) { console.error('[streamer] EventSub online:', error); }
      try { offlineSub = await createEventSub('stream.offline', identity.id); }
      catch (error) { console.error('[streamer] EventSub offline:', error); }

      if (onlineSub || offlineSub) {
        await query(
          `UPDATE twitch_links
           SET eventsub_online_id=COALESCE(NULLIF($2,''),eventsub_online_id),
               eventsub_offline_id=COALESCE(NULLIF($3,''),eventsub_offline_id),
               updated_at=NOW()
           WHERE discord_id=$1`,
          [discordId, onlineSub, offlineSub],
        );
      }

      const stream = await getStream(identity.id, 1);
      if (stream) {
        await query(
          `UPDATE twitch_links
           SET stream_online=TRUE,stream_id=$2,stream_title=$3,stream_game_name=$4,
               stream_thumbnail_url=$5,stream_started_at=$6,stream_viewer_count=$7,updated_at=NOW()
           WHERE discord_id=$1`,
          [discordId, stream.id, stream.title, stream.gameName, stream.thumbnailUrl, toMysqlDateTime(stream.startedAt), stream.viewerCount],
        );
        if (validSnowflake(cfg.liveRoleId)) {
          try { await setDiscordRole(discordId, cfg.liveRoleId, true); }
          catch (error) { console.warn('[streamer] Rôle Discord En Live:', error.message); }
        }
        await maybeAnnounceForDiscord(discordId);
      }

      res.redirect('/account.html?twitch=linked');
    } catch (error) {
      console.error('[streamer] Callback Twitch:', error);
      res.status(500).send(`Erreur lors de la liaison Twitch: ${String(error.message || error)}`);
    }
  });

  app.post('/api/account/twitch/unlink', requireDiscordUser, async (req, res) => {
    try {
      const discordId = req.session.discordId;
      const result = await query(`SELECT * FROM twitch_links WHERE discord_id=$1 LIMIT 1`, [discordId]);
      const link = result.rows[0];
      if (!link) return res.json({ ok: true, linked: false });

      await deleteEventSub(link.eventsub_online_id);
      await deleteEventSub(link.eventsub_offline_id);

      const cfg = discordConfig();
      for (const roleId of [cfg.liveRoleId, cfg.streamerRoleId]) {
        if (validSnowflake(roleId)) {
          try { await setDiscordRole(discordId, roleId, false); }
          catch (error) { console.warn('[streamer] Retrait rôle Discord:', error.message); }
        }
      }

      await queueMinecraftAction(discordId, 'remove');
      await query(`DELETE FROM twitch_links WHERE discord_id=$1`, [discordId]);
      res.json({ ok: true, linked: false });
    } catch (error) {
      console.error('[streamer] Unlink Twitch:', error);
      res.status(500).json({ error: 'Impossible de délier Twitch.' });
    }
  });

  app.post('/webhooks/twitch/eventsub', (req, res) => {
    if (!verifyTwitchSignature(req)) return res.sendStatus(403);

    const messageType = String(req.get('Twitch-Eventsub-Message-Type') || '');
    const messageId = String(req.get('Twitch-Eventsub-Message-Id') || '');
    const payload = req.body || {};

    if (messageType === 'webhook_callback_verification') {
      return res.status(200).type('text/plain').send(String(payload.challenge || ''));
    }

    if (messageType === 'revocation') {
      console.warn('[streamer] EventSub révoqué:', payload.subscription?.status, payload.subscription?.id);
      return res.sendStatus(204);
    }

    if (messageType !== 'notification') return res.sendStatus(204);
    res.sendStatus(204);

    setImmediate(async () => {
      try {
        const inserted = await query(
          `INSERT IGNORE INTO twitch_event_messages(message_id,received_at) VALUES($1,NOW())`,
          [messageId],
        );
        if (!inserted.rowCount) return;

        const type = String(payload.subscription?.type || '');
        if (type === 'stream.online') await processStreamOnline(payload.event);
        else if (type === 'stream.offline') await processStreamOffline(payload.event);
      } catch (error) {
        console.error('[streamer] Traitement EventSub:', error);
      }
    });
  });

  app.post('/api/internal/streamer/heartbeat', requireBridge, async (req, res) => {
    try {
      const serverId = String(req.body?.server_id || '').trim().slice(0, 80);
      const players = Array.isArray(req.body?.players) ? req.body.players.slice(0, 300) : [];
      if (!serverId) return res.status(400).json({ error: 'server_id manquant.' });

      const memberships = [];
      for (const raw of players) {
        const uuid = String(raw?.uuid || '').trim().slice(0, 64);
        const username = String(raw?.username || '').trim().slice(0, 32);
        if (!uuid || !username) continue;

        await query(
          `INSERT INTO streamer_presence(minecraft_uuid,minecraft_username,server_id,last_seen_at)
           VALUES($1,$2,$3,NOW())
           ON DUPLICATE KEY UPDATE minecraft_username=VALUES(minecraft_username),last_seen_at=NOW()`,
          [uuid, username, serverId],
        );

        const linked = await query(
          `SELECT tl.discord_id,tl.stream_online
           FROM minecraft_accounts ma
           LEFT JOIN twitch_links tl ON tl.discord_id=ma.discord_id
           WHERE ma.minecraft_uuid=$1
           LIMIT 1`,
          [uuid],
        );
        const row = linked.rows[0];
        memberships.push({ uuid, streamer: Boolean(row?.discord_id) });

        if (row?.stream_online) {
          try { await maybeAnnounceForMinecraftUuid(uuid); }
          catch (error) { console.warn('[streamer] Annonce au heartbeat:', error.message); }
        }
      }

      const ttl = bridgeConfig().presenceTtlSeconds;
      await query(`DELETE FROM streamer_presence WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ${ttl * 2} SECOND)`);

      res.json({ ok: true, memberships });
    } catch (error) {
      console.error('[streamer] Heartbeat:', error);
      res.status(500).json({ error: 'Heartbeat impossible.' });
    }
  });

  app.get('/api/internal/streamer/poll', requireBridge, async (req, res) => {
    try {
      const serverId = String(req.query.server_id || '').trim().slice(0, 80);
      if (!serverId) return res.status(400).json({ error: 'server_id manquant.' });

      const candidates = await query(
        `SELECT id,discord_id,minecraft_uuid,minecraft_username,action,attempt_count
         FROM streamer_minecraft_actions
         WHERE status='pending'
            OR (status='processing' AND claimed_at < DATE_SUB(NOW(),INTERVAL 2 MINUTE))
         ORDER BY id
         LIMIT 20`,
      );

      const actions = [];
      for (const action of candidates.rows) {
        const claim = await query(
          `UPDATE streamer_minecraft_actions
           SET status='processing',claimed_by=$2,claimed_at=NOW(),attempt_count=attempt_count+1,updated_at=NOW()
           WHERE id=$1
             AND (status='pending' OR (status='processing' AND claimed_at < DATE_SUB(NOW(),INTERVAL 2 MINUTE)))`,
          [action.id, serverId],
        );
        if (claim.rowCount) actions.push(action);
      }

      const announcements = await query(
        `SELECT a.id,a.minecraft_uuid,a.minecraft_username,a.twitch_login,a.twitch_display_name,
                a.stream_title,a.stream_game_name,a.stream_thumbnail_url,a.twitch_url,a.created_at
         FROM streamer_announcements a
         LEFT JOIN streamer_announcement_acks ack
           ON ack.announcement_id=a.id AND ack.server_id=$1
         WHERE ack.announcement_id IS NULL
           AND a.expires_at > NOW()
         ORDER BY a.id
         LIMIT 10`,
        [serverId],
      );

      res.json({ ok: true, actions, announcements: announcements.rows });
    } catch (error) {
      console.error('[streamer] Poll bridge:', error);
      res.status(500).json({ error: 'Poll impossible.' });
    }
  });

  app.post('/api/internal/streamer/action/:id/ack', requireBridge, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const ok = Boolean(req.body?.ok);
      const serverId = String(req.body?.server_id || '').trim().slice(0, 80);
      const errorMessage = String(req.body?.error || '').slice(0, 1000);
      if (!Number.isSafeInteger(id) || id <= 0 || !serverId) return res.status(400).json({ error: 'ACK invalide.' });

      if (ok) {
        await query(
          `UPDATE streamer_minecraft_actions
           SET status='done',last_error=NULL,completed_at=NOW(),updated_at=NOW()
           WHERE id=$1 AND claimed_by=$2`,
          [id, serverId],
        );
      } else {
        const current = await query(
          `SELECT attempt_count FROM streamer_minecraft_actions WHERE id=$1 AND claimed_by=$2 LIMIT 1`,
          [id, serverId],
        );
        const attempts = Number(current.rows[0]?.attempt_count || 0);
        await query(
          `UPDATE streamer_minecraft_actions
           SET status=$3,last_error=$4,claimed_by=NULL,claimed_at=NULL,updated_at=NOW()
           WHERE id=$1 AND claimed_by=$2`,
          [id, serverId, attempts >= 5 ? 'failed' : 'pending', errorMessage || 'Erreur inconnue'],
        );
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('[streamer] ACK action:', error);
      res.status(500).json({ error: 'ACK impossible.' });
    }
  });

  app.post('/api/internal/streamer/announcement/:id/ack', requireBridge, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const serverId = String(req.body?.server_id || '').trim().slice(0, 80);
      if (!Number.isSafeInteger(id) || id <= 0 || !serverId) return res.status(400).json({ error: 'ACK invalide.' });

      await query(
        `INSERT IGNORE INTO streamer_announcement_acks(announcement_id,server_id,ack_at)
         VALUES($1,$2,NOW())`,
        [id, serverId],
      );
      res.json({ ok: true });
    } catch (error) {
      console.error('[streamer] ACK annonce:', error);
      res.status(500).json({ error: 'ACK impossible.' });
    }
  });

  const cleanupTimer = setInterval(async () => {
    try {
      const ttl = bridgeConfig().presenceTtlSeconds;
      await query(`DELETE FROM streamer_presence WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ${ttl * 2} SECOND)`);
      await query(`DELETE FROM twitch_event_messages WHERE received_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
      await query(`DELETE FROM streamer_announcement_acks WHERE ack_at < DATE_SUB(NOW(), INTERVAL 2 DAY)`);
      await query(`DELETE FROM streamer_announcements WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`);
    } catch (error) {
      console.warn('[streamer] Nettoyage:', error.message);
    }
  }, 10 * 60_000);
  cleanupTimer.unref?.();

  console.log('[streamer] Twitch / Discord / Minecraft streamer system chargé.');
}

module.exports = { installStreamerSystem };
