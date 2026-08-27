let leaderboardEntries = [];
let activeKit = 'overall';
let kitCatalog = [];
let openedProfile = null;

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
  const required = Number(entry.placement_games_required || 10);
  const games = Number(entry.games || 0);
  const rankLabel = ranked ? Trizone.escapeHtml(entry.tier) : 'UNRANKED';
  const eloLabel = ranked ? `${Number(entry.elo)} ELO` : `${games}/${required} placements`;
  const rawPlayer = String(entry.username || '');
  const player = Trizone.escapeHtml(Trizone.minecraftDisplayName(rawPlayer));
  const playerHead = Trizone.minecraftPlayerHeadHtml({ username: rawPlayer, uuid: entry.uuid }, 'lb-avatar');
  return `<article class="leaderboard-row ${placeClass} rank-${tierClass(ranked ? entry.tier : 'Unranked')} is-clickable" data-name="${Trizone.escapeHtml(String(entry.username).toLowerCase())}" data-player-profile="${Trizone.escapeHtml(rawPlayer)}" tabindex="0" role="button" aria-label="Voir le profil Duels de ${player}">
    <div class="lb-position">${medal}</div>
    ${playerHead}
    <div class="lb-player">
      <strong>${player}</strong>
      <span><em class="${tierClass(ranked ? entry.tier : 'Unranked')}">${rankLabel}</em><b class="lb-elo-chip ${tierClass(ranked ? entry.tier : 'Unranked')}">${eloLabel}</b><span class="lb-record">${entry.wins}W / ${entry.losses}L · KDR ${entry.kdr}</span></span>
    </div>
    <div class="lb-badges">${renderBadges(entry.kits)}</div>
    <span class="lb-profile-hint">Profil ›</span>
  </article>`;
}
function bindProfileRows() {
  document.querySelectorAll('[data-player-profile]').forEach((el) => {
    const open = () => openPlayerProfile(el.dataset.playerProfile);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
}
function applySearch() {
  const q = String(document.getElementById('leaderboard-search')?.value || '').trim().toLowerCase();
  const filtered = q ? leaderboardEntries.filter((e) => String(e.username).toLowerCase().includes(q)) : leaderboardEntries;
  const root=document.getElementById('leaderboard-root');
  root.innerHTML = filtered.length ? filtered.map(row).join('') : `<div class="empty-state lb-empty"><div class="lb-empty-icon">${Trizone.minecraftIconHtml('NETHER_STAR', '', 'mc-icon-empty')}</div><h2>Aucun joueur</h2><p>Les joueurs apparaîtront ici dès que leurs données Duels seront synchronisées.</p></div>`;
  Trizone.bindMinecraftIcons(root);
  Trizone.bindMinecraftPlayerHeads(root);
  bindProfileRows();
}
async function loadLeaderboard(kit) {
  activeKit = kit;
  document.querySelectorAll('[data-lb-kit]').forEach((b) => b.classList.toggle('active', b.dataset.lbKit === kit));
  const root = document.getElementById('leaderboard-root'); root.innerHTML = '<div class="skeleton"></div>';
  const info = kit === 'overall' ? { name: 'Overall', emoji: '', icon: 'NETHER_STAR' } : kitCatalog.find((k) => k.key === kit) || { name: kit, emoji: '⚔', icon: 'IRON_SWORD' };
  const title = document.getElementById('leaderboard-title');
  title.innerHTML = `${Trizone.minecraftIconHtml(info.icon || 'BARRIER', '', 'mc-icon-title')} ${Trizone.escapeHtml(info.name)}`;
  Trizone.bindMinecraftIcons(title);
  document.getElementById('leaderboard-subtitle').textContent = kit === 'overall' ? 'Classement Duels · clique sur un joueur pour ouvrir son profil' : `Classement ${info.name} · UNRANKED avant 10 matchs`;
  try {
    const data = await Trizone.json(`/api/duels/leaderboard?kit=${encodeURIComponent(kit)}&limit=100`);
    leaderboardEntries = data.entries || [];
    applySearch();
  } catch (error) { root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

function closePlayerProfile() {
  const modal=document.getElementById('duel-profile-modal');
  if (!modal) return;
  modal.hidden=true; modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open'); openedProfile=null;
}

async function renderPublicKit(profile, kitKey) {
  const detail=document.getElementById('duel-profile-detail');
  if (!detail) return;
  const stat=profile.kits.find((k)=>k.kit===kitKey) || profile.kits[0];
  if (!stat) { detail.innerHTML='<p class="muted">Aucun kit disponible.</p>'; return; }
  document.querySelectorAll('[data-public-kit]').forEach((b)=>b.classList.toggle('active', b.dataset.publicKit===stat.kit));
  detail.innerHTML='<div class="skeleton duel-chart-skeleton"></div>';
  try {
    const history=await Trizone.json(`/api/duels/player/history?player=${encodeURIComponent(profile.username)}&kit=${encodeURIComponent(stat.kit)}&limit=200`);
    detail.innerHTML=`<div class="public-kit-summary">
      <div class="public-kit-main">${Trizone.minecraftIconHtml(stat.icon,stat.emoji||'⚔','mc-icon-card')}<div><h3>${Trizone.escapeHtml(stat.name||stat.kit)}</h3><p>${stat.ranked ? `<b>${stat.elo} ELO</b> · ${Trizone.escapeHtml(stat.tier)}` : `<b>UNRANKED</b> · ${stat.games}/${stat.placement_games_required||10} placements`}</p></div></div>
      <div class="duel-mini-stats"><span><b>${stat.wins}</b> wins</span><span><b>${stat.losses}</b> loses</span><span><b>${stat.kills}</b> kills</span><span><b>${stat.deaths}</b> deaths</span><span><b>${stat.kdr}</b> KDR</span><span><b>${stat.win_rate}%</b> WR</span></div>
    </div>${TrizoneDuelsUI.historyPanel(stat,history)}`;
    Trizone.bindMinecraftIcons(detail);
  } catch(error) { detail.innerHTML=`<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

async function openPlayerProfile(username) {
  const modal=document.getElementById('duel-profile-modal');
  const body=document.getElementById('duel-profile-body');
  if (!modal || !body) return;
  modal.hidden=false; modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  body.innerHTML='<div class="skeleton"></div>';
  try {
    const profile=await Trizone.json(`/api/duels/player?player=${encodeURIComponent(username)}`);
    openedProfile=profile;
    if (!profile?.kits?.length) { body.innerHTML='<p class="muted">Aucune statistique de kit pour ce joueur.</p>'; return; }
    body.innerHTML=`<div class="duel-public-profile-head">${Trizone.minecraftPlayerHeadHtml({ username: profile.username, uuid: profile.uuid }, 'lb-avatar duel-profile-player-head')}<div><span>PROFIL DUELS</span><h2>${Trizone.escapeHtml(Trizone.minecraftDisplayName(profile.username))}</h2><p>Choisis un kit pour voir ses statistiques et sa progression.</p></div></div>
      <div class="duel-profile-kit-tabs">${profile.kits.map((kit,index)=>`<button class="duel-profile-kit-tab ${index===0?'active':''}" type="button" data-public-kit="${Trizone.escapeHtml(kit.kit)}">${Trizone.minecraftIconHtml(kit.icon,kit.emoji||'⚔','mc-icon-tab')}<span>${Trizone.escapeHtml(kit.name||kit.kit)}</span><small>${kit.ranked ? `${kit.tier} · ${kit.elo}` : `UNRANKED ${kit.games}/${kit.placement_games_required||10}`}</small></button>`).join('')}</div>
      <div id="duel-profile-detail"></div>`;
    Trizone.bindMinecraftIcons(body);
    Trizone.bindMinecraftPlayerHeads(body);
    body.querySelectorAll('[data-public-kit]').forEach((button)=>button.addEventListener('click',()=>renderPublicKit(profile,button.dataset.publicKit)));
    await renderPublicKit(profile,profile.kits[0].kit);
  } catch(error) { body.innerHTML=`<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

async function bootLeaderboard() {
  trizoneHeader('leaderboard'); trizoneFooter(); await Trizone.boot();
  document.getElementById('duel-profile-close')?.addEventListener('click',closePlayerProfile);
  document.getElementById('duel-profile-modal')?.addEventListener('click',(event)=>{ if(event.target?.dataset?.closeProfile==='1') closePlayerProfile(); });
  document.addEventListener('keydown',(event)=>{ if(event.key==='Escape' && openedProfile) closePlayerProfile(); });
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
