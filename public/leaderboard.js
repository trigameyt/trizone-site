let leaderboardEntries = [];
let activeKit = 'overall';
let kitCatalog = [];

function tierClass(tier) { return `tier-${String(tier || 'unranked').toLowerCase()}`; }
function avatarClass(name) {
  let h = 0;
  for (const ch of String(name || 'Trizone')) h = (h * 31 + ch.charCodeAt(0)) % 12;
  return `avatar-c${h}`;
}
function renderBadges(kits) {
  return (kits || []).slice(0, 12).map((k) => {
    const title = k.ranked ? `${k.name}: ${k.elo} ELO` : `${k.name}: Unranked (${k.games || 0}/${k.placement_games_required || 10})`;
    const label = k.ranked ? k.tier : 'U';
    return `<span class="lb-kit-badge ${tierClass(k.ranked ? k.tier : 'Unranked')}" title="${Trizone.escapeHtml(title)}">${Trizone.minecraftIconHtml(k.icon, k.emoji || '⚔', 'mc-icon-badge')}<b>${Trizone.escapeHtml(label)}</b></span>`;
  }).join('');
}
function row(entry) {
  const ranked = entry.ranked === true;
  const position = ranked ? Number(entry.position || 0) : 0;
  const podiumMaterial = position === 1 ? 'GOLD_INGOT' : position === 2 ? 'IRON_INGOT' : position === 3 ? 'COPPER_INGOT' : null;
  const medal = ranked
    ? (podiumMaterial ? `${Trizone.minecraftIconHtml(podiumMaterial, '', 'mc-icon-place')}<small>${position}</small>` : `<b>${position || '—'}.</b>`)
    : '<b>U</b>';
  const placeClass = ranked && position <= 3 ? `place-${position}` : '';
  const initials = String(entry.username || '?').slice(0, 2).toUpperCase();
  const required = Number(entry.placement_games_required || 10);
  const games = Number(entry.games || 0);
  const rankLabel = ranked ? Trizone.escapeHtml(entry.tier) : 'UNRANKED';
  const eloLabel = ranked ? `${Number(entry.elo)} ELO` : `${games}/${required} placements`;
  return `<article class="leaderboard-row ${placeClass} rank-${tierClass(ranked ? entry.tier : 'Unranked')}" data-name="${Trizone.escapeHtml(String(entry.username).toLowerCase())}">
    <div class="lb-position">${medal}</div>
    <div class="lb-avatar ${avatarClass(entry.username)}"><span>${Trizone.escapeHtml(initials)}</span></div>
    <div class="lb-player">
      <strong>${Trizone.escapeHtml(entry.username)}</strong>
      <span><em class="${tierClass(ranked ? entry.tier : 'Unranked')}">${rankLabel}</em><b class="lb-elo-chip ${tierClass(ranked ? entry.tier : 'Unranked')}">${eloLabel}</b><span class="lb-record">${entry.wins}W / ${entry.losses}L · KDR ${entry.kdr}</span></span>
    </div>
    <div class="lb-badges">${renderBadges(entry.kits)}</div>
  </article>`;
}
function applySearch() {
  const q = String(document.getElementById('leaderboard-search')?.value || '').trim().toLowerCase();
  const filtered = q ? leaderboardEntries.filter((e) => String(e.username).toLowerCase().includes(q)) : leaderboardEntries;
  document.getElementById('leaderboard-root').innerHTML = filtered.length ? filtered.map(row).join('') : `<div class="empty-state lb-empty"><div class="lb-empty-icon">${Trizone.minecraftIconHtml('NETHER_STAR', '', 'mc-icon-empty')}</div><h2>Aucun joueur</h2><p>Les joueurs apparaîtront ici dès que leurs données Duels seront synchronisées.</p></div>`;
  Trizone.bindMinecraftIcons(document.getElementById('leaderboard-root'));
}
async function loadLeaderboard(kit) {
  activeKit = kit;
  document.querySelectorAll('[data-lb-kit]').forEach((b) => b.classList.toggle('active', b.dataset.lbKit === kit));
  const root = document.getElementById('leaderboard-root'); root.innerHTML = '<div class="skeleton"></div>';
  const info = kit === 'overall' ? { name: 'Overall', emoji: '', icon: 'NETHER_STAR' } : kitCatalog.find((k) => k.key === kit) || { name: kit, emoji: '⚔', icon: 'IRON_SWORD' };
  const title = document.getElementById('leaderboard-title');
  title.innerHTML = `${Trizone.minecraftIconHtml(info.icon || 'BARRIER', '', 'mc-icon-title')} ${Trizone.escapeHtml(info.name)}`;
  Trizone.bindMinecraftIcons(title);
  document.getElementById('leaderboard-subtitle').textContent = kit === 'overall' ? 'Classement Duels · joueurs en placement affichés UNRANKED' : `Classement ${info.name} · UNRANKED avant 10 matchs`;
  try {
    const data = await Trizone.json(`/api/duels/leaderboard?kit=${encodeURIComponent(kit)}&limit=100`);
    leaderboardEntries = data.entries || [];
    applySearch();
  } catch (error) { root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}
async function bootLeaderboard() {
  trizoneHeader('leaderboard'); trizoneFooter(); await Trizone.boot();
  try {
    const data = await Trizone.json('/api/duels/kits'); kitCatalog = data.kits || [];
    const tabs = document.getElementById('leaderboard-tabs');
    tabs.innerHTML = `<button class="lb-tab active" data-lb-kit="overall">${Trizone.minecraftIconHtml('NETHER_STAR', '', 'mc-icon-tab')}<b>Overall</b></button>${kitCatalog.map((k) => `<button class="lb-tab" data-lb-kit="${Trizone.escapeHtml(k.key)}">${Trizone.minecraftIconHtml(k.icon || 'BARRIER', '', 'mc-icon-tab')}<b>${Trizone.escapeHtml(k.name)}</b></button>`).join('')}`;
    Trizone.bindMinecraftIcons(tabs);
    document.querySelectorAll('[data-lb-kit]').forEach((button) => button.addEventListener('click', () => loadLeaderboard(button.dataset.lbKit)));
    await loadLeaderboard('overall');
  } catch (error) { document.getElementById('leaderboard-root').innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
  document.getElementById('leaderboard-search').addEventListener('input', applySearch);
}
document.addEventListener('DOMContentLoaded', bootLeaderboard);
