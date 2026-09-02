(function () {
  'use strict';

  function esc(value) {
    return window.Trizone?.escapeHtml ? Trizone.escapeHtml(String(value ?? '')) : String(value ?? '');
  }

  function fmtDate(value) {
    if (!value) return 'Date inconnue';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';
    try {
      return new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    } catch {
      return date.toLocaleDateString('fr-CH');
    }
  }

  function resultIcon(entry) {
    const placement = String(entry?.placement || '');
    if (placement === '1er') return Trizone.minecraftIconHtml('GOLD_INGOT', '🥇', 'mc-icon-tournament-history');
    if (placement === '2e') return Trizone.minecraftIconHtml('IRON_INGOT', '🥈', 'mc-icon-tournament-history');
    if (placement === '3e') return Trizone.minecraftIconHtml('COPPER_INGOT', '🥉', 'mc-icon-tournament-history');
    if (String(entry?.state) === 'running') return Trizone.minecraftIconHtml('CLOCK', '⏱', 'mc-icon-tournament-history');
    return Trizone.minecraftIconHtml('NETHER_STAR', '✦', 'mc-icon-tournament-history');
  }

  function resultClass(entry) {
    const tone = String(entry?.result_tone || 'default').toLowerCase();
    return `is-${tone.replace(/[^a-z0-9_-]/g, '') || 'default'}`;
  }

  function tournamentCard(entry) {
    const kit = entry?.kit || { name: 'Kit', icon: 'IRON_SWORD' };
    const placement = entry?.placement ? `<strong class="tournament-history-placement">${esc(entry.placement)}</strong>` : '';
    const record = Number(entry?.matches_played || 0) > 0
      ? `<span>${Number(entry.wins || 0)}V · ${Number(entry.losses || 0)}D</span>`
      : '<span>Aucun match joué</span>';
    const date = entry?.finished_at || entry?.started_at || entry?.updated_at;
    const players = Number(entry?.players || 0);
    const maxPlayers = Number(entry?.max_players || 0);
    const playerText = maxPlayers ? `${players}/${maxPlayers} joueurs` : (players ? `${players} joueurs` : 'Joueurs —');

    return `<article class="tournament-history-card ${resultClass(entry)}">
      <div class="tournament-history-rank">${resultIcon(entry)}${placement}</div>
      <div class="tournament-history-main">
        <div class="tournament-history-title-line">
          <div>
            <h3>${esc(entry?.name || 'Tournoi')}</h3>
            <span class="tournament-history-result ${resultClass(entry)}">${esc(entry?.result || 'Participant')}</span>
          </div>
          <time>${esc(fmtDate(date))}</time>
        </div>
        <div class="tournament-history-meta">
          <span>${Trizone.minecraftIconHtml(kit.icon || 'IRON_SWORD', '⚔', 'mc-icon-inline')} ${esc(kit.name || kit.key || 'Kit')}</span>
          <span>FT${Math.max(1, Number(entry?.first_to || 1))}</span>
          <span>${esc(entry?.format || 'Élimination directe')}</span>
          <span>${esc(playerText)}</span>
          ${record}
        </div>
      </div>
    </article>`;
  }

  function historyHtml(data, compact = false) {
    const tournaments = Array.isArray(data?.tournaments) ? data.tournaments : [];
    const summary = data?.summary || {};

    if (!tournaments.length) {
      return `<div class="tournament-history-empty">
        ${Trizone.minecraftIconHtml('NETHER_STAR', '✦', 'mc-icon-empty')}
        <div><strong>Aucun tournoi enregistré</strong><p>Les participations apparaîtront ici dès qu'un tournoi aura été synchronisé.</p></div>
      </div>`;
    }

    return `<div class="tournament-history-summary ${compact ? 'is-compact' : ''}">
      <div><span>Participations</span><strong>${Number(summary.participated || tournaments.length)}</strong></div>
      <div><span>Victoires</span><strong>${Number(summary.championships || 0)}</strong></div>
      <div><span>Finales</span><strong>${Number(summary.finals || 0)}</strong></div>
      <div><span>Podiums</span><strong>${Number(summary.podiums || 0)}</strong></div>
    </div>
    <div class="tournament-history-list">${tournaments.map(tournamentCard).join('')}</div>`;
  }

  async function fetchHistory({ uuid, username, limit = 50 }) {
    const params = new URLSearchParams();
    if (uuid) params.set('uuid', uuid);
    if (username) params.set('player', username);
    params.set('limit', String(limit));
    return Trizone.json(`/api/tournaments/player?${params.toString()}`);
  }

  async function loadAccountTournamentHistory() {
    const root = document.getElementById('account-tournaments-root');
    if (!root) return;
    root.innerHTML = '<div class="skeleton tournament-history-skeleton"></div>';

    try {
      const duel = await Trizone.json('/api/account/duels');
      if (!duel?.linked) {
        root.innerHTML = '<p class="muted">Lie ton compte Minecraft pour afficher tes participations aux tournois.</p>';
        return;
      }

      const uuid = duel?.data?.uuid || '';
      const username = duel?.data?.username || '';
      if (!uuid && !username) {
        root.innerHTML = '<p class="muted">Aucun profil Minecraft synchronisé.</p>';
        return;
      }

      const history = await fetchHistory({ uuid, username, limit: 100 });
      root.innerHTML = historyHtml(history, false);
      Trizone.bindMinecraftIcons(root);
    } catch (error) {
      root.innerHTML = `<div class="notice bad">${esc(error?.message || 'Impossible de charger les tournois.')}</div>`;
    }
  }

  async function appendPublicTournamentHistory(username) {
    const body = document.getElementById('duel-profile-body');
    if (!body || !username) return;

    body.querySelector('#public-tournaments-section')?.remove();
    const section = document.createElement('section');
    section.id = 'public-tournaments-section';
    section.className = 'public-tournaments-section';
    section.innerHTML = `<div class="public-tournaments-head"><span>TOURNOIS</span><h3>Historique des tournois</h3></div><div id="public-tournaments-root"><div class="skeleton tournament-history-skeleton"></div></div>`;
    body.appendChild(section);

    const root = section.querySelector('#public-tournaments-root');
    try {
      const history = await fetchHistory({ username, limit: 50 });
      root.innerHTML = historyHtml(history, true);
      Trizone.bindMinecraftIcons(root);
    } catch (error) {
      root.innerHTML = `<div class="notice bad">${esc(error?.message || 'Impossible de charger les tournois.')}</div>`;
    }
  }

  function hookLeaderboardProfiles() {
    if (typeof window.openPlayerProfile !== 'function' || window.openPlayerProfile.__trizoneTournamentHook) return;
    const original = window.openPlayerProfile;
    const wrapped = async function (username) {
      await original(username);
      await appendPublicTournamentHistory(username);
    };
    wrapped.__trizoneTournamentHook = true;
    window.openPlayerProfile = wrapped;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('account-tournaments-root')) loadAccountTournamentHistory();
    hookLeaderboardProfiles();
  });
})();
