let leaderboardEntries = [];
let activeKit = 'overall';
let kitCatalog = [];

function tierClass(tier) { return `tier-${String(tier || 'LT5').toLowerCase()}`; }
function avatarClass(name) {
  let h = 0;
  for (const ch of String(name || 'Trizone')) h = (h * 31 + ch.charCodeAt(0)) % 12;
  return `avatar-c${h}`;
}
function renderBadges(kits) {
  return (kits || []).slice(0, 12).map((k) => `<span class="lb-kit-badge ${tierClass(k.tier)}" title="${Trizone.escapeHtml(`${k.name}: ${k.elo} ELO`)}">${Trizone.minecraftIconHtml(k.icon, k.emoji || '⚔', 'mc-icon-badge')}<b>${Trizone.escapeHtml(k.tier)}</b></span>`).join('');
}
function row(entry) {
  const podiumMaterial = entry.position === 1 ? 'GOLD_INGOT' : entry.position === 2 ? 'IRON_INGOT' : entry.position === 3 ? 'COPPER_INGOT' : null;
  const medal = podiumMaterial ? `${Trizone.minecraftIconHtml(podiumMaterial, '', 'mc-icon-place')}<small>${entry.position}</small>` : `<b>${entry.position}.</b>`;
  const placeClass = entry.position <= 3 ? `place-${entry.position}` : '';
  const initials = String(entry.username || '?').slice(0, 2).toUpperCase();
  return `<article class="leaderboard-row ${placeClass} rank-${tierClass(entry.tier)}" data-name="${Trizone.escapeHtml(String(entry.username).toLowerCase())}">
    <div class="lb-position">${medal}</div>
    <div class="lb-avatar ${avatarClass(entry.username)}"><span>${Trizone.escapeHtml(initials)}</span></div>
    <div class="lb-player">
      <strong>${Trizone.escapeHtml(entry.username)}</strong>
      <span><em class="${tierClass(entry.tier)}">${Trizone.escapeHtml(entry.tier)}</em><b class="lb-elo-chip ${tierClass(entry.tier)}">${entry.elo} ELO</b><span class="lb-record">${entry.wins}W / ${entry.losses}L · KDR ${entry.kdr}</span></span>
    </div>
    <div class="lb-badges">${renderBadges(entry.kits)}</div>
  </article>`;
}
function applySearch() {
  const q = String(document.getElementById('leaderboard-search')?.value || '').trim().toLowerCase();
  const filtered = q ? leaderboardEntries.filter((e) => String(e.username).toLowerCase().includes(q)) : leaderboardEntries;
  document.getElementById('leaderboard-root').innerHTML = filtered.length ? filtered.map(row).join('') : `<div class="empty-state lb-empty"><div class="lb-empty-icon">${Trizone.minecraftIconHtml('NETHER_STAR', '', 'mc-icon-empty')}</div><h2>Aucun joueur</h2><p>Aucun résultat pour cette recherche.</p></div>`;
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
  document.getElementById('leaderboard-subtitle').textContent = kit === 'overall' ? 'Classement par ELO moyen · 300 ELO minimum' : `Classement ${info.name} · chaque joueur commence à 300 ELO`;
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
