const TOURNAMENT_PREVIEW = {
  id: 'trizone-cup-7',
  name: 'TRIZONE CUP #7',
  description: 'Tournoi PvP Trizone en élimination directe. Suis les affrontements, le kit choisi et les manches de chaque match.',
  state: 'running',
  phase: 'Demi-finales',
  format: 'Élimination directe',
  players: 8,
  max_players: 8,
  started_at: '2026-08-31T18:00:00+02:00',
  kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
  best_of: 3,
  matches: [
    {
      id: 'qf-1', round: 1, state: 'finished', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'NeyZox', score: 2, winner: true },
      player2: { username: 'Xylaro', score: 0, winner: false },
    },
    {
      id: 'qf-2', round: 1, state: 'finished', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'BySlide', score: 2, winner: true },
      player2: { username: 'LePanda_', score: 1, winner: false },
    },
    {
      id: 'qf-3', round: 1, state: 'finished', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'ZeyKoh', score: 2, winner: true },
      player2: { username: 'Mathox', score: 0, winner: false },
    },
    {
      id: 'qf-4', round: 1, state: 'finished', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'Wqnder', score: 2, winner: true },
      player2: { username: 'ItzRayan', score: 1, winner: false },
    },
    {
      id: 'sf-1', round: 2, state: 'finished', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'NeyZox', score: 2, winner: true },
      player2: { username: 'BySlide', score: 1, winner: false },
    },
    {
      id: 'sf-2', round: 2, state: 'live', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'ZeyKoh', score: 1, winner: false },
      player2: { username: 'Wqnder', score: 1, winner: false },
    },
    {
      id: 'final-1', round: 3, state: 'pending', best_of: 3,
      kit: { key: 'nodebuff', name: 'NoDebuff', icon: 'SPLASH_POTION' },
      player1: { username: 'NeyZox' },
      player2: null,
    },
  ],
};

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
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
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

function matchHtml(match, isFinal = false) {
  const state = normalizedMatchState(match.state);
  const bestOf = Math.max(1, Number(match.best_of || match.bestOf || 3));
  const kit = match.kit || { name: 'Kit à déterminer', icon: 'IRON_SWORD' };
  return `<article class="tournament-match is-${state} ${isFinal ? 'is-final' : ''}">
    <div class="tournament-match-head">
      <span class="match-state is-${state}">${matchStateLabel(state)}</span>
      <small>BO${bestOf} · ${bestOf} manche${bestOf > 1 ? 's' : ''}</small>
    </div>
    ${playerHtml(match.player1)}
    ${playerHtml(match.player2)}
    <div class="tournament-match-foot">
      <span class="tournament-match-kit">${Trizone.minecraftIconHtml(kit.icon || 'IRON_SWORD', '', 'mc-icon-tournament')}<span>${Trizone.escapeHtml(kit.name || kit.key || 'Kit')}</span></span>
      <span>#${Trizone.escapeHtml(match.id || 'match')}</span>
    </div>
  </article>`;
}

function renderBracket(tournament) {
  const root = document.getElementById('tournament-bracket');
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  if (!matches.length) {
    root.innerHTML = `<div class="empty-state tournament-empty"><h2>Aucun match</h2><p>Le tableau apparaîtra ici dès que le tournoi sera synchronisé depuis Minecraft.</p></div>`;
    return;
  }

  const maxRound = Math.max(...matches.map((match) => Number(match.round || match.round_no || 1)));
  const rounds = [];
  for (let round = 1; round <= maxRound; round += 1) {
    const roundMatches = matches.filter((match) => Number(match.round || match.round_no || 1) === round);
    rounds.push(`<section class="tournament-round">
      <div class="tournament-round-title">${roundName(round, maxRound)}</div>
      <div class="tournament-round-matches">
        ${roundMatches.map((match) => matchHtml(match, round === maxRound)).join('')}
      </div>
    </section>`);
  }

  root.style.setProperty('--round-count', String(maxRound));
  root.style.minWidth = `${Math.max(800, maxRound * 260)}px`;
  root.innerHTML = rounds.join('');
  Trizone.bindMinecraftIcons(root);
  Trizone.bindMinecraftPlayerHeads(root);
}

function featuredPlayer(player) {
  if (!player?.username) {
    return `<div class="featured-player">
      <span class="mc-player-head is-fallback"><span class="mc-player-head-fallback">?</span></span>
      <strong class="muted">À déterminer</strong>
    </div>`;
  }
  return `<div class="featured-player">${Trizone.minecraftPlayerHeadHtml(player)}<strong>${Trizone.escapeHtml(Trizone.minecraftDisplayName(player.username))}</strong></div>`;
}

function renderFeaturedMatch(tournament) {
  const root = document.getElementById('tournament-featured-match');
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const match = matches.find((item) => normalizedMatchState(item.state) === 'live')
    || matches.find((item) => normalizedMatchState(item.state) === 'waiting')
    || matches[matches.length - 1];

  if (!match) {
    root.innerHTML = '<p class="muted">Aucun match disponible.</p>';
    return;
  }

  const maxRound = Math.max(...matches.map((item) => Number(item.round || item.round_no || 1)));
  const round = Number(match.round || match.round_no || 1);
  const state = normalizedMatchState(match.state);
  const bestOf = Math.max(1, Number(match.best_of || match.bestOf || tournament.best_of || 3));
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
      <div><span>Format</span><strong>BO${bestOf} · ${bestOf} manche${bestOf > 1 ? 's' : ''}</strong></div>
      <div><span>Score</span><strong>${match.player1?.score ?? '—'} - ${match.player2?.score ?? '—'}</strong></div>
    </div>`;

  const liveDot = document.getElementById('live-dot');
  liveDot.classList.toggle('is-live', state === 'live');
  Trizone.bindMinecraftPlayerHeads(root);
}

function renderTournament(tournament, { preview = false } = {}) {
  const state = normalizedState(tournament.state);
  const kit = tournament.kit || { name: 'Variable', icon: 'IRON_SWORD' };
  const bestOf = Math.max(1, Number(tournament.best_of || tournament.bestOf || 3));
  const players = Number(tournament.players || tournament.player_count || 0);
  const maxPlayers = Number(tournament.max_players || tournament.maxPlayers || players || 0);
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const completed = matches.filter((match) => normalizedMatchState(match.state) === 'done').length;

  document.getElementById('tournament-name').textContent = tournament.name || 'Tournoi Trizone';
  document.getElementById('tournament-breadcrumb-name').textContent = tournament.name || 'Tournoi';
  document.getElementById('tournament-description').textContent = tournament.description || 'Tournoi PvP Trizone.';

  const status = document.getElementById('tournament-status');
  status.textContent = stateLabel(state);
  status.className = `tournament-status is-${state}`;

  const kitRoot = document.getElementById('tournament-kit');
  kitRoot.innerHTML = `${Trizone.minecraftIconHtml(kit.icon || 'IRON_SWORD', '', 'mc-icon-tournament')}<span>${Trizone.escapeHtml(kit.name || kit.key || 'Variable')}</span>`;
  Trizone.bindMinecraftIcons(kitRoot);

  document.getElementById('tournament-format').textContent = tournament.format || 'Élimination directe';
  document.getElementById('tournament-best-of').textContent = `BO${bestOf} · ${bestOf} manche${bestOf > 1 ? 's' : ''}`;
  document.getElementById('tournament-phase').textContent = tournament.phase || 'À déterminer';
  document.getElementById('tournament-players').textContent = maxPlayers ? `${players} / ${maxPlayers}` : String(players || '—');
  document.getElementById('tournament-type').textContent = tournament.format || 'Élimination directe';
  document.getElementById('tournament-start').textContent = formatDate(tournament.started_at || tournament.startedAt);
  document.getElementById('tournament-progress').textContent = matches.length ? `${completed} / ${matches.length} matchs terminés` : 'Aucun match';

  const source = document.getElementById('tournament-source');
  source.hidden = !preview;

  renderBracket(tournament);
  renderFeaturedMatch(tournament);
}

async function loadTournament() {
  try {
    const data = await Trizone.json('/api/tournaments/active');
    const tournament = data?.tournament || data;
    if (!tournament || typeof tournament !== 'object') throw new Error('Réponse tournoi invalide.');
    renderTournament(tournament, { preview: false });
  } catch (error) {
    console.info('[tournois] API tournoi pas encore branchée, affichage de l’aperçu.', error?.message || error);
    renderTournament(TOURNAMENT_PREVIEW, { preview: true });
  }
}

async function bootTournaments() {
  trizoneHeader('tournaments');
  trizoneFooter();
  await Trizone.boot();
  await loadTournament();
}

document.addEventListener('DOMContentLoaded', bootTournaments);
