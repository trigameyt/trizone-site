const PREVIEW_PLAYERS = [
  'NeyZox', 'Xylaro', 'BySlide', 'LePanda_', 'ZeyKoh', 'Mathox', 'Wqnder', 'ItzRayan',
  'KylianPvP', 'SkyZer', 'DarkNono', 'Pixel_', 'ItsNexy_', 'Blaze_75', 'AzertyX', 'WshNono',
  'Kyomuu', 'LeVraiCube', 'Skaazyy', 'NeoXZ_', 'Trizien', 'Craftix', 'Lunex', 'ShadowPvP',
  'Vortyx', 'Frozenn', 'PandaX', 'Zorak_', 'Minee', 'Raxo_', 'Keno_', 'Yuma'
];

function buildPreviewRound({ round, players, states = [], firstTo = 2, kit, closeScores = false }) {
  const matches = [];
  const winners = [];

  for (let i = 0; i < players.length; i += 2) {
    const index = i / 2;
    const p1 = players[i] || null;
    const p2 = players[i + 1] || null;
    const state = states[index] || 'pending';
    const player1Wins = index % 2 === 0;
    const complete = state === 'finished' && p1 && p2;
    const live = state === 'live' && p1 && p2;
    const winner = complete ? (player1Wins ? p1 : p2) : null;

    let score1;
    let score2;
    if (complete) {
      score1 = player1Wins ? firstTo : (closeScores ? Math.max(0, firstTo - 1) : 0);
      score2 = player1Wins ? (closeScores ? Math.max(0, firstTo - 1) : 0) : firstTo;
    } else if (live) {
      score1 = 1;
      score2 = 1;
    }

    matches.push({
      id: `r${round}-${index + 1}`,
      round,
      state,
      first_to: firstTo,
      kit,
      player1: p1 ? { username: p1, score: score1, winner: complete && player1Wins } : null,
      player2: p2 ? { username: p2, score: score2, winner: complete && !player1Wins } : null,
    });

    winners.push(winner);
  }

  return { matches, winners };
}

function createPreviewTournament() {
  const kit = { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' };
  const matches = [];

  // 32 joueurs = 31 matchs = 5 tours.
  const r1 = buildPreviewRound({
    round: 1,
    players: PREVIEW_PLAYERS,
    states: Array(16).fill('finished'),
    firstTo: 2,
    kit,
    closeScores: true,
  });
  matches.push(...r1.matches);

  const r2 = buildPreviewRound({
    round: 2,
    players: r1.winners,
    states: Array(8).fill('finished'),
    firstTo: 2,
    kit,
    closeScores: true,
  });
  matches.push(...r2.matches);

  const r3 = buildPreviewRound({
    round: 3,
    players: r2.winners,
    states: ['finished', 'finished', 'live', 'pending'],
    firstTo: 2,
    kit,
    closeScores: true,
  });
  matches.push(...r3.matches);

  const r4 = buildPreviewRound({
    round: 4,
    players: r3.winners,
    states: ['pending', 'pending'],
    firstTo: 2,
    kit,
  });
  matches.push(...r4.matches);

  const r5 = buildPreviewRound({
    round: 5,
    players: r4.winners,
    states: ['pending'],
    firstTo: 2,
    kit,
  });
  matches.push(...r5.matches);

  return {
    id: 'trizone-cup-7',
    name: 'TRIZONE CUP #7',
    description: 'Exemple complet d’un tournoi PvP Trizone à 32 joueurs, avec le kit et le format FT2 de chaque match.',
    state: 'running',
    phase: 'Quarts de finale',
    format: 'Élimination directe',
    players: 32,
    max_players: 32,
    started_at: '2026-08-31T18:00:00+02:00',
    kit,
    first_to: 2,
    matches,
  };
}

const TOURNAMENT_PREVIEW = createPreviewTournament();

function normalizedState(value) {
  const state = String(value || '').toLowerCase();
  if (['running', 'live', 'in_progress', 'active'].includes(state)) return 'running';
  if (['finished', 'done', 'complete', 'completed'].includes(state)) return 'finished';
  return 'registration';
}

function normalizedMatchState(value) {
  const state = String(value || '').toLowerCase();
  if (['running', 'live', 'in_progress', 'active'].includes(state)) return 'live';
  if (['finished', 'done', 'complete', 'completed'].includes(state)) return 'done';
  return 'waiting';
}

function stateLabel(state) {
  if (state === 'running') return 'En cours';
  if (state === 'finished') return 'Terminé';
  return 'Inscriptions';
}

function matchStateLabel(state) {
  if (state === 'live') return 'En cours';
  if (state === 'done') return 'Terminé';
  return 'À venir';
}

function formatDate(value) {
  if (!value) return 'À déterminer';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', ' ·');
}

function roundName(round, maxRound) {
  const distance = maxRound - round;
  if (distance === 0) return 'Finale';
  if (distance === 1) return 'Demi-finales';
  if (distance === 2) return 'Quarts de finale';
  if (distance === 3) return 'Huitièmes de finale';
  if (distance === 4) return 'Seizièmes de finale';
  return `Tour ${round}`;
}

function resolveFirstTo(match, tournament = {}) {
  const explicit = Number(
    match?.first_to ||
    match?.firstTo ||
    match?.wins_required ||
    match?.winsRequired ||
    tournament?.first_to ||
    tournament?.firstTo ||
    tournament?.wins_required ||
    tournament?.winsRequired
  );

  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  // Compatibilité avec les anciennes données BOx si l'API en envoie encore.
  const bestOf = Number(
    match?.best_of ||
    match?.bestOf ||
    tournament?.best_of ||
    tournament?.bestOf ||
    0
  );

  if (Number.isFinite(bestOf) && bestOf > 0) {
    return Math.max(1, Math.ceil(bestOf / 2));
  }

  return 2;
}

function ftLongLabel(firstTo) {
  const safe = Math.max(1, Number(firstTo || 2));
  return `FT${safe} · first to ${safe} win${safe > 1 ? 's' : ''}`;
}

function ftShortLabel(firstTo) {
  return `FT${Math.max(1, Number(firstTo || 2))}`;
}

function playerHtml(player) {
  if (!player?.username) {
    return `<div class="tournament-player is-empty">
      <span class="mc-player-head is-fallback"><span class="mc-player-head-fallback">?</span></span>
      <span class="tournament-player-name muted">À déterminer</span>
      <span class="tournament-player-score">—</span>
    </div>`;
  }

  const winner = player.winner === true;
  const score = Number.isFinite(Number(player.score)) ? Number(player.score) : '—';

  return `<div class="tournament-player ${winner ? 'is-winner' : ''}">
    ${Trizone.minecraftPlayerHeadHtml(player)}
    <span class="tournament-player-name">${Trizone.escapeHtml(Trizone.minecraftDisplayName(player.username))}</span>
    <span class="tournament-player-score">${score}</span>
  </div>`;
}

function matchHtml(match, tournament = {}, isFinal = false) {
  const state = normalizedMatchState(match.state);
  const firstTo = resolveFirstTo(match, tournament);
  const kit = match.kit || tournament.kit || { name: 'Kit à déterminer', icon: 'IRON_SWORD' };

  return `<article
    class="tournament-match is-${state} ${isFinal ? 'is-final' : ''}"
    data-match-id="${Trizone.escapeHtml(match.id || '')}">
    <div class="tournament-match-head">
      <span class="match-state is-${state}">${matchStateLabel(state)}</span>
      <small title="${Trizone.escapeHtml(ftLongLabel(firstTo))}">${ftShortLabel(firstTo)}</small>
    </div>
    ${playerHtml(match.player1)}
    ${playerHtml(match.player2)}
    <div class="tournament-match-foot">
      <span class="tournament-match-kit">
        ${Trizone.minecraftIconHtml(kit.icon || 'IRON_SWORD', '', 'mc-icon-tournament')}
        <span>${Trizone.escapeHtml(kit.name || kit.key || 'Kit')}</span>
      </span>
      <span>#${Trizone.escapeHtml(match.id || 'match')}</span>
    </div>
  </article>`;
}

let connectorFrame = 0;

function drawBracketConnectors() {
  cancelAnimationFrame(connectorFrame);

  connectorFrame = requestAnimationFrame(() => {
    const root = document.getElementById('tournament-bracket');
    if (!root) return;

    root.querySelector('.tournament-connectors')?.remove();

    const rounds = [...root.querySelectorAll('.tournament-round')];
    if (rounds.length < 2) return;

    const rootRect = root.getBoundingClientRect();
    if (!rootRect.width || !rootRect.height) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tournament-connectors');
    svg.setAttribute('viewBox', `0 0 ${rootRect.width} ${rootRect.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
      const sourceMatches = [...rounds[roundIndex].querySelectorAll('.tournament-match')];
      const targetMatches = [...rounds[roundIndex + 1].querySelectorAll('.tournament-match')];

      targetMatches.forEach((target, targetIndex) => {
        const sources = [
          sourceMatches[targetIndex * 2],
          sourceMatches[targetIndex * 2 + 1],
        ].filter(Boolean);

        if (!sources.length) return;

        const targetRect = target.getBoundingClientRect();
        const targetX = targetRect.left - rootRect.left;
        const targetY = targetRect.top - rootRect.top + targetRect.height / 2;

        sources.forEach((source) => {
          const sourceRect = source.getBoundingClientRect();
          const sourceX = sourceRect.right - rootRect.left;
          const sourceY = sourceRect.top - rootRect.top + sourceRect.height / 2;
          const midX = sourceX + Math.max(6, (targetX - sourceX) * 0.5);

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`);
          path.setAttribute('class', 'tournament-connector-path');
          svg.appendChild(path);
        });
      });
    }

    root.prepend(svg);
  });
}

function renderBracket(tournament) {
  const root = document.getElementById('tournament-bracket');
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];

  if (!matches.length) {
    root.innerHTML = `<div class="empty-state tournament-empty">
      <h2>Aucun match</h2>
      <p>Le tableau apparaîtra ici dès que le tournoi sera synchronisé depuis Minecraft.</p>
    </div>`;
    return;
  }

  const maxRound = Math.max(...matches.map((match) => Number(match.round || match.round_no || 1)));
  const rounds = [];

  for (let round = 1; round <= maxRound; round += 1) {
    const roundMatches = matches.filter((match) => Number(match.round || match.round_no || 1) === round);

    rounds.push(`<section class="tournament-round" data-round="${round}">
      <div class="tournament-round-title">${roundName(round, maxRound)}</div>
      <div class="tournament-round-matches">
        ${roundMatches.map((match) => matchHtml(match, tournament, round === maxRound)).join('')}
      </div>
    </section>`);
  }

  root.style.setProperty('--round-count', String(maxRound));
  root.style.minWidth = '0';
  root.innerHTML = rounds.join('');

  Trizone.bindMinecraftIcons(root);
  Trizone.bindMinecraftPlayerHeads(root);

  drawBracketConnectors();
  setTimeout(drawBracketConnectors, 120);
}

function featuredPlayer(player) {
  if (!player?.username) {
    return `<div class="featured-player">
      <span class="mc-player-head is-fallback"><span class="mc-player-head-fallback">?</span></span>
      <strong class="muted">À déterminer</strong>
    </div>`;
  }

  return `<div class="featured-player">
    ${Trizone.minecraftPlayerHeadHtml(player)}
    <strong>${Trizone.escapeHtml(Trizone.minecraftDisplayName(player.username))}</strong>
  </div>`;
}

function renderFeaturedMatch(tournament) {
  const root = document.getElementById('tournament-featured-match');
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];

  const match =
    matches.find((item) => normalizedMatchState(item.state) === 'live') ||
    matches.find((item) => normalizedMatchState(item.state) === 'waiting') ||
    matches[matches.length - 1];

  if (!match) {
    root.innerHTML = '<p class="muted">Aucun match disponible.</p>';
    return;
  }

  const maxRound = Math.max(...matches.map((item) => Number(item.round || item.round_no || 1)));
  const round = Number(match.round || match.round_no || 1);
  const state = normalizedMatchState(match.state);
  const firstTo = resolveFirstTo(match, tournament);
  const kit = match.kit || tournament.kit || { name: 'À déterminer', icon: 'IRON_SWORD' };

  root.innerHTML = `
    <div class="featured-round">${roundName(round, maxRound)} · ${matchStateLabel(state)}</div>
    <div class="featured-versus">
      ${featuredPlayer(match.player1)}
      <div class="featured-vs">VS</div>
      ${featuredPlayer(match.player2)}
    </div>
    <div class="featured-meta">
      <div><span>Kit</span><strong>${Trizone.escapeHtml(kit.name || kit.key || 'Kit')}</strong></div>
      <div><span>Format</span><strong>${ftLongLabel(firstTo)}</strong></div>
      <div><span>Score</span><strong>${match.player1?.score ?? '—'} - ${match.player2?.score ?? '—'}</strong></div>
    </div>`;

  const liveDot = document.getElementById('live-dot');
  liveDot.classList.toggle('is-live', state === 'live');

  Trizone.bindMinecraftPlayerHeads(root);
}

function renderTournament(tournament, { preview = false } = {}) {
  const state = normalizedState(tournament.state);
  const kit = tournament.kit || { name: 'Variable', icon: 'IRON_SWORD' };
  const firstTo = resolveFirstTo({}, tournament);
  const players = Number(tournament.players || tournament.player_count || 0);
  const maxPlayers = Number(tournament.max_players || tournament.maxPlayers || players || 0);
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const completed = matches.filter((match) => normalizedMatchState(match.state) === 'done').length;

  document.getElementById('tournament-name').textContent = tournament.name || 'Tournoi Trizone';
  document.getElementById('tournament-breadcrumb-name').textContent = tournament.name || 'Tournoi';
  document.getElementById('tournament-description').textContent =
    tournament.description || 'Tournoi PvP Trizone.';

  const status = document.getElementById('tournament-status');
  status.textContent = stateLabel(state);
  status.className = `tournament-status is-${state}`;

  const kitRoot = document.getElementById('tournament-kit');
  kitRoot.innerHTML = `
    ${Trizone.minecraftIconHtml(kit.icon || 'IRON_SWORD', '', 'mc-icon-tournament')}
    <span>${Trizone.escapeHtml(kit.name || kit.key || 'Variable')}</span>`;
  Trizone.bindMinecraftIcons(kitRoot);

  document.getElementById('tournament-format').textContent =
    tournament.format || 'Élimination directe';

  document.getElementById('tournament-best-of').textContent = ftLongLabel(firstTo);
  document.getElementById('tournament-phase').textContent = tournament.phase || 'À déterminer';
  document.getElementById('tournament-players').textContent =
    maxPlayers ? `${players} / ${maxPlayers}` : String(players || '—');

  document.getElementById('tournament-type').textContent =
    tournament.format || 'Élimination directe';

  document.getElementById('tournament-start').textContent =
    formatDate(tournament.started_at || tournament.startedAt);

  document.getElementById('tournament-progress').textContent =
    matches.length ? `${completed} / ${matches.length} matchs terminés` : 'Aucun match';

  const source = document.getElementById('tournament-source');
  source.hidden = !preview;

  renderBracket(tournament);
  renderFeaturedMatch(tournament);
}

async function loadTournament() {
  try {
    const data = await Trizone.json('/api/tournaments/active');
    const tournament = data?.tournament || data;

    if (!tournament || typeof tournament !== 'object') {
      throw new Error('Réponse tournoi invalide.');
    }

    renderTournament(tournament, { preview: false });
  } catch (error) {
    console.info(
      '[tournois] API tournoi pas encore branchée, affichage de l’aperçu.',
      error?.message || error
    );

    renderTournament(TOURNAMENT_PREVIEW, { preview: true });
  }
}

async function bootTournaments() {
  trizoneHeader('tournaments');
  trizoneFooter();
  await Trizone.boot();
  await loadTournament();

  window.addEventListener('resize', drawBracketConnectors, { passive: true });
}

document.addEventListener('DOMContentLoaded', bootTournaments);
