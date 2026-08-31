'use strict';

const crypto = require('crypto');

const ACTIVE_STATES = new Set(['registration', 'waiting', 'running', 'live', 'active', 'in_progress']);
const FINISHED_STATES = new Set(['finished', 'done', 'completed', 'complete']);

function cleanString(value, max = 160, fallback = '') {
  const out = String(value ?? '').trim();
  if (!out) return fallback;
  return out.slice(0, max);
}

function cleanUuid(value) {
  const raw = cleanString(value, 64, '');
  return /^[0-9a-fA-F-]{32,36}$/.test(raw) ? raw.toLowerCase() : null;
}

function cleanInt(value, fallback = 0, min = 0, max = 100000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizeState(value, fallback = 'waiting') {
  const state = cleanString(value, 32, fallback).toLowerCase();
  if (['live', 'active', 'in_progress'].includes(state)) return 'running';
  if (['done', 'completed', 'complete'].includes(state)) return 'finished';
  if (['pending', 'queued'].includes(state)) return 'pending';
  if (['registration', 'waiting', 'running', 'finished'].includes(state)) return state;
  return fallback;
}

function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function timingSafeSecretOk(received) {
  const expected = String(process.env.TOURNAMENT_SYNC_SECRET || '').trim();
  const got = String(received || '').trim();
  if (expected.length < 16 || got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(got, 'utf8'));
  } catch {
    return false;
  }
}

function requireTournamentSecret(req, res, next) {
  if (!timingSafeSecretOk(req.get('X-Trizone-Secret'))) {
    return res.status(401).json({ error: 'Secret tournoi invalide.' });
  }
  return next();
}

function normalizeFormat(value) {
  const raw = cleanString(value, 32, 'single').toLowerCase();
  if (raw.includes('double')) return 'double';
  if (raw.includes('team')) return 'teams';
  if (raw.includes('single')) return 'single';
  return raw || 'single';
}

function displayFormat(value) {
  const raw = normalizeFormat(value);
  if (raw === 'single') return 'Élimination directe';
  if (raw === 'double') return 'Double élimination';
  if (raw === 'teams') return 'Équipes';
  return raw.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function humanKitName(key) {
  const value = cleanString(key, 64, 'random');
  if (value.toLowerCase() === 'random') return 'Aléatoire';
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeTournamentPayload(body) {
  const sourceServer = cleanString(body?.source_server, 80, 'Lobby');
  const raw = body?.tournament && typeof body.tournament === 'object' ? body.tournament : body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const error = new Error('Payload tournoi invalide.');
    error.status = 400;
    throw error;
  }

  const id = cleanString(raw.id || raw.tournament_id, 96, '');
  const name = cleanString(raw.name, 120, 'Tournoi Trizone');
  if (!id) {
    const error = new Error('tournament.id manquant.');
    error.status = 400;
    throw error;
  }

  const firstTo = cleanInt(raw.first_to ?? raw.firstTo, 2, 1, 20);
  const matches = Array.isArray(raw.matches) ? raw.matches.slice(0, 255).map((match, index) => ({
    ...match,
    id: cleanString(match?.id || match?.match_id, 96, `${id}-m${index + 1}`),
    round: cleanInt(match?.round ?? match?.round_no, 1, 1, 64),
    state: normalizeState(match?.state, 'pending'),
    first_to: cleanInt(match?.first_to ?? match?.firstTo, firstTo, 1, 20),
    kit: cleanString(match?.kit, 64, cleanString(raw.kit, 64, 'random')),
    player1_uuid: cleanUuid(match?.player1_uuid),
    player1_name: cleanString(match?.player1_name, 32, ''),
    player2_uuid: cleanUuid(match?.player2_uuid),
    player2_name: cleanString(match?.player2_name, 32, ''),
    winner_uuid: cleanUuid(match?.winner_uuid),
    score1: match?.score1 == null ? undefined : cleanInt(match.score1, 0, 0, 20),
    score2: match?.score2 == null ? undefined : cleanInt(match.score2, 0, 0, 20),
    third_place: Boolean(match?.third_place),
  })) : [];

  const tournament = {
    ...raw,
    id,
    name,
    state: normalizeState(raw.state, 'waiting'),
    format: normalizeFormat(raw.format || raw.format_key),
    kit_mode: cleanString(raw.kit_mode, 32, 'fixed'),
    kit: cleanString(raw.kit, 64, 'random'),
    kits: Array.isArray(raw.kits) ? raw.kits.slice(0, 64).map((v) => cleanString(v, 64, '')).filter(Boolean) : [],
    first_to: firstTo,
    players: cleanInt(raw.players, 0, 0, 512),
    max_players: cleanInt(raw.max_players ?? raw.maxPlayers, 0, 0, 512),
    round: cleanInt(raw.round, 1, 1, 64),
    registration_open: Boolean(raw.registration_open),
    winner_uuid: cleanUuid(raw.winner_uuid),
    updated_at: cleanString(raw.updated_at, 80, new Date().toISOString()),
    matches,
  };

  return { sourceServer, tournament };
}

async function upsertTournamentCore(client, tournament) {
  await client.query(
    `INSERT INTO duel_tournaments
      (tournament_id, name, state, format_key, kit_mode, winner_uuid, started_at, finished_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,
       CASE WHEN $3='running' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
       CASE WHEN $3='finished' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
       CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),
       state=VALUES(state),
       format_key=VALUES(format_key),
       kit_mode=VALUES(kit_mode),
       winner_uuid=COALESCE(VALUES(winner_uuid), winner_uuid),
       started_at=CASE
         WHEN started_at IS NULL AND VALUES(state)='running' THEN CURRENT_TIMESTAMP(3)
         ELSE started_at
       END,
       finished_at=CASE
         WHEN VALUES(state)='finished' THEN COALESCE(finished_at, CURRENT_TIMESTAMP(3))
         ELSE finished_at
       END,
       updated_at=CURRENT_TIMESTAMP(3)`,
    [
      tournament.id,
      tournament.name,
      tournament.state,
      tournament.format,
      tournament.kit_mode,
      tournament.winner_uuid,
    ],
  );

  for (const match of tournament.matches) {
    await client.query(
      `INSERT INTO duel_matches
        (match_id, tournament_id, round_no, player1_uuid, player2_uuid, winner_uuid, kit_key, state, started_at, finished_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         CASE WHEN $8='running' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
         CASE WHEN $8='finished' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
         CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         tournament_id=VALUES(tournament_id),
         round_no=VALUES(round_no),
         player1_uuid=VALUES(player1_uuid),
         player2_uuid=VALUES(player2_uuid),
         winner_uuid=COALESCE(VALUES(winner_uuid), winner_uuid),
         kit_key=VALUES(kit_key),
         state=VALUES(state),
         started_at=CASE
           WHEN started_at IS NULL AND VALUES(state)='running' THEN CURRENT_TIMESTAMP(3)
           ELSE started_at
         END,
         finished_at=CASE
           WHEN VALUES(state)='finished' THEN COALESCE(finished_at, CURRENT_TIMESTAMP(3))
           ELSE finished_at
         END,
         updated_at=CURRENT_TIMESTAMP(3)`,
      [
        match.id,
        tournament.id,
        match.round,
        match.player1_uuid,
        match.player2_uuid,
        match.winner_uuid,
        match.kit === 'random' ? null : match.kit,
        match.state,
      ],
    );
  }
}

function samePair(match, a, b) {
  const m1 = cleanUuid(match?.player1_uuid);
  const m2 = cleanUuid(match?.player2_uuid);
  if (!m1 || !m2 || !a || !b) return false;
  return (m1 === a && m2 === b) || (m1 === b && m2 === a);
}

function pickScoreTarget(tournament, body) {
  const a = cleanUuid(body.player1_uuid);
  const b = cleanUuid(body.player2_uuid);
  if (!a || !b) return null;

  const kit = cleanString(body.kit, 64, '').toLowerCase();
  const candidates = (Array.isArray(tournament.matches) ? tournament.matches : [])
    .filter((match) => samePair(match, a, b))
    .filter((match) => !kit || !match.kit || String(match.kit).toLowerCase() === kit)
    .sort((x, y) => {
      const sx = normalizeState(x.state, 'pending') === 'running' ? 2 : (normalizeState(x.state, 'pending') === 'pending' ? 1 : 0);
      const sy = normalizeState(y.state, 'pending') === 'running' ? 2 : (normalizeState(y.state, 'pending') === 'pending' ? 1 : 0);
      if (sx !== sy) return sy - sx;
      return cleanInt(y.round, 1, 1, 64) - cleanInt(x.round, 1, 1, 64);
    });

  return candidates[0] || null;
}

function patchMatchScore(match, body) {
  const bodyP1 = cleanUuid(body.player1_uuid);
  const bodyP2 = cleanUuid(body.player2_uuid);
  const direct = cleanUuid(match.player1_uuid) === bodyP1 && cleanUuid(match.player2_uuid) === bodyP2;

  const score1 = cleanInt(body.score1, 0, 0, 20);
  const score2 = cleanInt(body.score2, 0, 0, 20);
  match.score1 = direct ? score1 : score2;
  match.score2 = direct ? score2 : score1;

  match.first_to = cleanInt(body.first_to, cleanInt(match.first_to, 2, 1, 20), 1, 20);
  match.state = normalizeState(body.state, match.state || 'running');

  const winner = cleanUuid(body.winner_uuid);
  if (winner) match.winner_uuid = winner;
  if (match.state === 'finished' && !match.winner_uuid) {
    if (match.score1 >= match.first_to) match.winner_uuid = cleanUuid(match.player1_uuid);
    if (match.score2 >= match.first_to) match.winner_uuid = cleanUuid(match.player2_uuid);
  }
  return match;
}

async function loadActiveSnapshot(query) {
  const result = await query(
    `SELECT w.tournament_id, w.state, w.source_server, w.snapshot, w.updated_at,
            t.started_at, t.finished_at
       FROM duel_tournament_web_snapshots w
       LEFT JOIN duel_tournaments t ON t.tournament_id=w.tournament_id
      WHERE w.state IN ('running','registration','waiting')
      ORDER BY
        CASE w.state WHEN 'running' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END,
        w.updated_at DESC
      LIMIT 1`,
  );
  return result.rows?.[0] || null;
}

async function kitCatalog(query) {
  const result = await query(
    `SELECT kit_key, display_name, icon_material
       FROM duel_kits
      WHERE active=TRUE`,
  );
  const map = new Map();
  for (const row of result.rows || []) {
    map.set(String(row.kit_key || '').toLowerCase(), {
      key: String(row.kit_key || ''),
      name: String(row.display_name || row.kit_key || 'Kit'),
      icon: String(row.icon_material || 'IRON_SWORD'),
    });
  }
  return map;
}

function kitView(key, catalog) {
  const safe = cleanString(key, 64, 'random');
  const found = catalog.get(safe.toLowerCase());
  if (found) return found;
  return {
    key: safe,
    name: humanKitName(safe),
    icon: safe.toLowerCase() === 'random' ? 'CHEST' : 'IRON_SWORD',
  };
}

function phaseLabel(tournament) {
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  if (!matches.length) return tournament.state === 'registration' ? 'Inscriptions' : 'À déterminer';

  const maxRound = Math.max(...matches.map((m) => cleanInt(m.round, 1, 1, 64)));
  const live = matches.find((m) => normalizeState(m.state, 'pending') === 'running');
  const pending = matches.find((m) => normalizeState(m.state, 'pending') === 'pending');
  const round = cleanInt(live?.round ?? pending?.round ?? tournament.round, 1, 1, 64);
  const distance = maxRound - round;

  if (distance === 0) return 'Finale';
  if (distance === 1) return 'Demi-finales';
  if (distance === 2) return 'Quarts de finale';
  if (distance === 3) return 'Huitièmes de finale';
  if (distance === 4) return 'Seizièmes de finale';
  return `Tour ${round}`;
}

function publicTournament(snapshot, dbRow, catalog) {
  const t = snapshot;
  const firstTo = cleanInt(t.first_to, 2, 1, 20);
  const matches = (Array.isArray(t.matches) ? t.matches : []).map((match) => {
    const winner = cleanUuid(match.winner_uuid);
    const p1Uuid = cleanUuid(match.player1_uuid);
    const p2Uuid = cleanUuid(match.player2_uuid);
    return {
      id: cleanString(match.id, 96, ''),
      round: cleanInt(match.round, 1, 1, 64),
      state: normalizeState(match.state, 'pending'),
      first_to: cleanInt(match.first_to, firstTo, 1, 20),
      kit: kitView(match.kit || t.kit, catalog),
      third_place: Boolean(match.third_place),
      player1: p1Uuid || match.player1_name ? {
        uuid: p1Uuid,
        username: cleanString(match.player1_name, 32, p1Uuid || 'Joueur'),
        score: match.score1 == null ? undefined : cleanInt(match.score1, 0, 0, 20),
        winner: Boolean(winner && p1Uuid && winner === p1Uuid),
      } : null,
      player2: p2Uuid || match.player2_name ? {
        uuid: p2Uuid,
        username: cleanString(match.player2_name, 32, p2Uuid || 'Joueur'),
        score: match.score2 == null ? undefined : cleanInt(match.score2, 0, 0, 20),
        winner: Boolean(winner && p2Uuid && winner === p2Uuid),
      } : null,
    };
  });

  return {
    id: cleanString(t.id, 96, ''),
    name: cleanString(t.name, 120, 'Tournoi Trizone'),
    description: `Tournoi PvP Trizone en ${displayFormat(t.format).toLowerCase()}. Les scores et le bracket sont synchronisés depuis le réseau Minecraft.`,
    state: normalizeState(t.state, 'waiting'),
    phase: phaseLabel(t),
    format: displayFormat(t.format),
    format_key: normalizeFormat(t.format),
    kit_mode: cleanString(t.kit_mode, 32, 'fixed'),
    kit: kitView(t.kit, catalog),
    kits: Array.isArray(t.kits) ? t.kits.map((key) => kitView(key, catalog)) : [],
    first_to: firstTo,
    players: cleanInt(t.players, 0, 0, 512),
    max_players: cleanInt(t.max_players, 0, 0, 512),
    round: cleanInt(t.round, 1, 1, 64),
    registration_open: Boolean(t.registration_open),
    winner_uuid: cleanUuid(t.winner_uuid),
    started_at: dbRow?.started_at || null,
    finished_at: dbRow?.finished_at || null,
    updated_at: t.updated_at || dbRow?.updated_at || null,
    matches,
  };
}

function installTournamentWebSync({ app, query, pool }) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new Error('Tournament WebSync: instance Express invalide.');
  }
  if (typeof query !== 'function' || !pool?.connect) {
    throw new Error('Tournament WebSync: accès MySQL invalide.');
  }

  app.post('/api/tournaments/sync', requireTournamentSecret, async (req, res) => {
    try {
      const { sourceServer, tournament } = normalizeTournamentPayload(req.body);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await upsertTournamentCore(client, tournament);

        await client.query(
          `INSERT INTO duel_tournament_web_snapshots
            (tournament_id, state, source_server, snapshot, first_seen_at, updated_at)
           VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE
             state=VALUES(state),
             source_server=VALUES(source_server),
             snapshot=VALUES(snapshot),
             updated_at=CURRENT_TIMESTAMP(3)`,
          [tournament.id, tournament.state, sourceServer, JSON.stringify(tournament)],
        );

        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }

      return res.json({
        ok: true,
        tournament_id: tournament.id,
        state: tournament.state,
        matches: tournament.matches.length,
      });
    } catch (error) {
      console.error('[tournaments/sync]', error);
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Erreur de synchronisation du tournoi.' });
    }
  });

  app.post('/api/tournaments/match-score', requireTournamentSecret, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const p1 = cleanUuid(body.player1_uuid);
      const p2 = cleanUuid(body.player2_uuid);
      if (!p1 || !p2 || p1 === p2) {
        return res.status(400).json({ error: 'Paire de joueurs invalide.' });
      }

      const activeRows = await query(
        `SELECT tournament_id, snapshot
           FROM duel_tournament_web_snapshots
          WHERE state IN ('running','registration','waiting')
          ORDER BY CASE state WHEN 'running' THEN 0 ELSE 1 END, updated_at DESC
          LIMIT 8`,
      );

      let selected = null;
      let tournament = null;
      let match = null;

      for (const row of activeRows.rows || []) {
        const candidate = safeJsonParse(row.snapshot, null);
        if (!candidate) continue;
        const candidateMatch = pickScoreTarget(candidate, body);
        if (candidateMatch) {
          selected = row;
          tournament = candidate;
          match = candidateMatch;
          break;
        }
      }

      // PVPPractice peut observer des duels hors tournoi.
      // On les ignore sans renvoyer d'erreur au serveur Minecraft.
      if (!selected || !tournament || !match) {
        return res.status(202).json({ ok: true, matched: false });
      }

      patchMatchScore(match, body);
      tournament.updated_at = cleanString(body.updated_at, 80, new Date().toISOString());

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE duel_tournament_web_snapshots
              SET snapshot=$2, updated_at=CURRENT_TIMESTAMP(3)
            WHERE tournament_id=$1`,
          [selected.tournament_id, JSON.stringify(tournament)],
        );

        await client.query(
          `UPDATE duel_matches
              SET state=$3,
                  winner_uuid=COALESCE($4, winner_uuid),
                  started_at=CASE
                    WHEN started_at IS NULL AND $3='running' THEN CURRENT_TIMESTAMP(3)
                    ELSE started_at
                  END,
                  finished_at=CASE
                    WHEN $3='finished' THEN COALESCE(finished_at, CURRENT_TIMESTAMP(3))
                    ELSE finished_at
                  END,
                  updated_at=CURRENT_TIMESTAMP(3)
            WHERE match_id=$1 AND tournament_id=$2`,
          [match.id, selected.tournament_id, match.state, cleanUuid(match.winner_uuid)],
        );

        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }

      return res.json({
        ok: true,
        matched: true,
        tournament_id: selected.tournament_id,
        match_id: match.id,
        score: [match.score1 ?? 0, match.score2 ?? 0],
        state: match.state,
      });
    } catch (error) {
      console.error('[tournaments/match-score]', error);
      return res.status(500).json({ error: 'Erreur de synchronisation du score.' });
    }
  });

  app.get('/api/tournaments/active', async (_req, res) => {
    try {
      const row = await loadActiveSnapshot(query);
      if (!row) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'Aucun tournoi actif.' });
      }

      const snapshot = safeJsonParse(row.snapshot, null);
      if (!snapshot) {
        return res.status(500).json({ error: 'Snapshot tournoi invalide.' });
      }

      const catalog = await kitCatalog(query);
      const tournament = publicTournament(snapshot, row, catalog);

      res.set('Cache-Control', 'no-store, max-age=0');
      return res.json({ tournament });
    } catch (error) {
      console.error('[tournaments/active]', error);
      return res.status(500).json({ error: 'Impossible de charger le tournoi.' });
    }
  });

  console.log('[Tournament WebSync] API active: /api/tournaments/sync, /api/tournaments/match-score, /api/tournaments/active');
}

module.exports = { installTournamentWebSync };
