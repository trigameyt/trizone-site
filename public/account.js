function fmtDate(value) {
  return value ? new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function purchaseSummary(order) {
  const label = Trizone.rankLabel(order.rank_key || 'default');
  const amount = Number(order.amount_total);
  const currency = String(order.currency || 'CHF').toUpperCase();
  let price = '';
  if (Number.isFinite(amount)) {
    try { price = new Intl.NumberFormat('fr-CH', { style: 'currency', currency }).format(amount / 100); }
    catch { price = `${(amount / 100).toFixed(2)} ${currency}`; }
  }
  return `Grade ${label}${price ? ` — ${price}` : ''}`;
}

function purchaseStatus(order) {
  if (order.active) return 'Payé / actif';
  if (order.payment_status === 'refunded') return 'Remboursé';
  if (order.payment_status === 'failed') return 'Échec du paiement';
  if (order.payment_status === 'paid') return 'Payé';
  return 'En attente';
}

function itemSymbol(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('SWORD')) return '⚔';
  if (t.includes('AXE')) return '🪓';
  if (t.includes('PICKAXE')) return '⛏';
  if (t.includes('SHOVEL')) return '♠';
  if (t.includes('HOE')) return '⌁';
  if (t.includes('MACE')) return '🔨';
  if (t.includes('BOW')) return '🏹';
  if (t.includes('CROSSBOW')) return '➶';
  if (t.includes('SHIELD')) return '🛡';
  if (t.includes('POTION')) return '⚗';
  if (t.includes('APPLE')) return '🍎';
  if (t.includes('PEARL')) return '◉';
  if (t.includes('CRYSTAL')) return '◆';
  if (t.includes('TOTEM')) return '♜';
  if (t.includes('HELMET')) return '⛑';
  if (t.includes('CHESTPLATE')) return '▣';
  if (t.includes('LEGGINGS')) return '▥';
  if (t.includes('BOOTS')) return '▰';
  if (t.includes('DIAMOND')) return '♦';
  if (t.includes('EMERALD')) return '◆';
  if (t.includes('GOLD')) return '●';
  if (t.includes('IRON')) return '■';
  if (t.includes('NETHERITE')) return '⬢';
  if (t.includes('BLOCK') || t.includes('STONE') || t.includes('PLANK')) return '▦';
  return '◇';
}

function prettyMaterial(type) {
  return String(type || 'AIR').toLowerCase().split('_').map((x) => x ? x[0].toUpperCase() + x.slice(1) : '').join(' ');
}

function itemColorClass(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('NETHERITE')) return 'mc-netherite';
  if (t.includes('DIAMOND')) return 'mc-diamond';
  if (t.includes('EMERALD')) return 'mc-emerald';
  if (t.includes('GOLD')) return 'mc-gold';
  if (t.includes('IRON')) return 'mc-iron';
  if (t.includes('REDSTONE')) return 'mc-redstone';
  if (t.includes('LAPIS')) return 'mc-lapis';
  if (t.includes('AMETHYST')) return 'mc-amethyst';
  if (t.includes('POTION')) return 'mc-potion';
  if (t.includes('ENCHANT')) return 'mc-enchant';
  return 'mc-default';
}

function renderItem(item, slot, hotbar = false) {
  if (!item || !item.type || item.type === 'AIR') return `<div class="mc-slot empty ${hotbar ? 'hotbar-slot' : ''}" title="Slot ${slot + 1}"><span class="mc-slot-number">${slot + 1}</span></div>`;
  const title = item.name || prettyMaterial(item.type);
  const materialId = `minecraft:${String(item.type).toLowerCase()}`;
  const amount = Math.max(1, Number(item.amount || 1));
  const enchantEntries = item.enchants && typeof item.enchants === 'object' ? Object.entries(item.enchants) : [];
  const loreEntries = Array.isArray(item.lore) ? item.lore.filter(Boolean) : [];
  const tooltipLines = [
    `<strong>${Trizone.escapeHtml(title)}</strong>`,
    `<code>${Trizone.escapeHtml(materialId)}</code>`,
    `<span>Quantité : <b>${amount}</b></span>`,
    ...enchantEntries.slice(0, 6).map(([k, v]) => `<span>✦ ${Trizone.escapeHtml(prettyMaterial(k))} ${Trizone.escapeHtml(String(v))}</span>`),
    ...loreEntries.slice(0, 4).map((line) => `<span>${Trizone.escapeHtml(String(line))}</span>`),
  ];
  return `<div class="mc-slot ${itemColorClass(item.type)} ${hotbar ? 'hotbar-slot' : ''}" tabindex="0" aria-label="${Trizone.escapeHtml(`${title}, ${materialId}, quantité ${amount}`)}">
    <span class="mc-item-symbol">${itemSymbol(item.type)}</span>
    ${amount > 1 ? `<b class="mc-count">${amount}</b>` : ''}
    <small>${Trizone.escapeHtml(prettyMaterial(item.type))}</small>
    <span class="mc-item-tooltip">${tooltipLines.join('')}</span>
  </div>`;
}

function inventoryGrid(items, size, columns = 9) {
  const bySlot = new Map((Array.isArray(items) ? items : []).map((item) => [Number(item.slot), item]));
  let html = `<div class="mc-grid mc-grid-${columns}">`;
  for (let i = 0; i < size; i += 1) html += renderItem(bySlot.get(i), i, size === 36 && i >= 27);
  return `${html}</div>`;
}

function duelTierClass(tier) {
  return `duel-tier tier-${String(tier || 'LT5').toLowerCase()}`;
}

function duelKitCard(stat, selected) {
  return `<article class="duel-kit-card ${selected ? 'selected' : ''}" data-duel-kit="${Trizone.escapeHtml(stat.kit)}">
    <div class="duel-kit-icon">${Trizone.escapeHtml(stat.emoji || '⚔')}</div>
    <div class="duel-kit-main">
      <div class="duel-kit-title"><strong>${Trizone.escapeHtml(stat.name || stat.kit)}</strong>${selected ? '<span class="selected-label">Affiché</span>' : ''}</div>
      <div class="elo-line"><span class="${duelTierClass(stat.tier)}">${Trizone.escapeHtml(stat.tier)}</span><b>${Number(stat.elo || 300)} ELO</b><span>#${Number(stat.placement || 0) || '—'}</span></div>
      <div class="duel-mini-stats"><span><b>${stat.wins}</b> wins</span><span><b>${stat.losses}</b> loses</span><span><b>${stat.kills}</b> kills</span><span><b>${stat.deaths}</b> deaths</span><span><b>${stat.kdr}</b> KDR</span><span><b>${stat.win_rate}%</b> WR</span><span><b>${stat.streak}</b> streak</span><span><b>${stat.best_streak}</b> best</span></div>
    </div>
    ${selected ? '' : `<button class="btn btn-quiet btn-small" type="button" data-select-duel-kit="${Trizone.escapeHtml(stat.kit)}">Afficher</button>`}
  </article>`;
}

async function generateLinkCode() {
  const box = document.getElementById('link-code-box');
  const button = document.getElementById('generate-code');
  if (!box || !button) return;
  button.disabled = true;
  try {
    const data = await Trizone.json('/api/account/link-code', { method: 'POST', body: '{}' });
    box.innerHTML = `<div class="link-result"><div class="link-code">${Trizone.escapeHtml(data.code)}</div><div><p>Sur le Lobby, tape :</p><div class="command-box">/link ${Trizone.escapeHtml(data.code)}</div><small>Le code reste valable 10 minutes.</small></div></div>`;
  } catch (error) { box.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; }
}

async function loadPurchases() {
  const root = document.getElementById('purchase-list');
  if (!root) return;
  try {
    const data = await Trizone.json('/api/account/purchases');
    if (!data.data?.length) { root.innerHTML = '<p class="muted">Aucun achat associé à ce compte pour le moment.</p>'; return; }
    root.innerHTML = data.data.map((order) => `<div class="list-row"><div><strong>${Trizone.escapeHtml(purchaseSummary(order))}</strong><small>${Trizone.escapeHtml(purchaseStatus(order))}</small></div><span>${fmtDate(order.purchased_at || order.updated_at)}</span></div>`).join('');
  } catch (error) { root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

async function loadDuels() {
  const root = document.getElementById('duel-stats-root');
  if (!root) return;
  try {
    const response = await Trizone.json('/api/account/duels');
    if (!response.linked) { root.innerHTML = '<p class="muted">Lie ton compte Minecraft pour voir tes statistiques de duel.</p>'; return; }
    const data = response.data;
    if (!data?.kits?.length) { root.innerHTML = '<p class="muted">Aucun duel synchronisé pour le moment. Les stats apparaîtront après la première synchronisation du serveur PvPpractice.</p>'; return; }
    const o = data.overall;
    root.innerHTML = `
      <div class="duel-overall">
        <div><span>Classement global</span><strong>#${o.placement || '—'}</strong></div>
        <div><span>ELO moyen</span><strong>${o.elo} <em class="${duelTierClass(o.tier)}">${o.tier}</em></strong></div>
        <div><span>Victoires / Défaites</span><strong>${o.wins} / ${o.losses}</strong></div>
        <div><span>KDR</span><strong>${o.kdr}</strong></div>
      </div>
      <div class="duel-selected-preview">Affichage actuel : ${(() => { const s=data.kits.find(k=>k.kit===data.selected_kit)||data.kits[0]; return `<b>| ${Trizone.escapeHtml(s.emoji || '⚔')} ${Trizone.escapeHtml(s.tier)} ${s.elo}</b>`; })()}</div>
      <div class="duel-kit-list">${data.kits.map((stat) => duelKitCard(stat, stat.kit === data.selected_kit)).join('')}</div>`;
    root.querySelectorAll('[data-select-duel-kit]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await Trizone.json('/api/account/duels/settings', { method: 'POST', body: JSON.stringify({ kit: button.dataset.selectDuelKit }) }); await loadDuels(); }
      catch (error) { root.insertAdjacentHTML('afterbegin', `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`); button.disabled = false; }
    }));
  } catch (error) { root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

async function loadGameData() {
  const root = document.getElementById('game-data-root');
  if (!root) return;
  try {
    const response = await Trizone.json('/api/account/game-data');
    if (!response.linked) { root.innerHTML = '<p class="muted">Lie ton compte Minecraft pour afficher ton inventaire.</p>'; return; }
    const data = response.data;
    if (!data) { root.innerHTML = '<p class="muted">Aucune synchro d’inventaire reçue. Rejoins le Lobby puis utilise <code>/link sync</code>.</p>'; return; }
    root.innerHTML = `
      <div class="inventory-meta"><span class="inventory-source-pill">🟣 ${Trizone.escapeHtml(data.source_server || 'Lobby')}</span><span class="inventory-world-pill">🌍 monde <b>${Trizone.escapeHtml(data.source_world || 'world')}</b></span><span>Synchro : <b>${fmtDate(data.updated_at)}</b></span></div>
      <div class="inventory-section"><h4>Inventaire Survie</h4>${inventoryGrid(data.inventory, 36)}</div>
      <div class="inventory-side-row">
        <div class="inventory-section"><h4>Armure</h4>${inventoryGrid(data.armor, 4, 4)}</div>
        <div class="inventory-section"><h4>Main secondaire</h4>${inventoryGrid(data.offhand ? [{...data.offhand, slot:0}] : [], 1, 1)}</div>
      </div>
      <div class="inventory-section"><h4>Ender Chest</h4>${inventoryGrid(data.ender_chest, 27)}</div>`;
  } catch (error) { root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
}

async function syncDiscordRank() {
  const button = document.getElementById('sync-discord-rank'); const status = document.getElementById('discord-rank-status'); if (!button || !status) return;
  button.disabled = true; status.innerHTML = '<span class="muted">Synchronisation…</span>';
  try { const data = await Trizone.json('/api/account/discord-rank/sync', { method: 'POST', body: '{}' }); const label = data.rank ? Trizone.rankLabel(data.rank) : 'aucun grade payant actif'; status.innerHTML = `<div class="notice good">Rôle Discord synchronisé : ${Trizone.escapeHtml(label)}.</div>`; }
  catch (error) { status.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; }
}

async function syncMinecraftRank() {
  const button = document.getElementById('sync-minecraft-rank'); const status = document.getElementById('minecraft-rank-status'); if (!button || !status) return;
  button.disabled = true; status.innerHTML = '<span class="muted">Mise en file de livraison…</span>';
  try { const data = await Trizone.json('/api/account/minecraft-rank/sync', { method: 'POST', body: '{}' }); const label = Trizone.rankLabel(data.rank || 'default'); status.innerHTML = `<div class="notice good">Synchronisation Minecraft demandée : ${Trizone.escapeHtml(label)}.</div>`; }
  catch (error) { status.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; }
}

async function loadAccount() {
  trizoneHeader('account'); trizoneFooter();
  const { me } = await Trizone.boot(); const root = document.getElementById('account-root');
  if (!me.authenticated) {
    root.innerHTML = `<div class="empty-state"><img src="/assets/trizone-logo-square.jpg" alt="Logo Trizone"><h2>Connecte ton Discord</h2><p>Trizone ne te demande pas de créer un mot de passe supplémentaire.</p><a class="btn btn-primary" href="/auth/discord">Connexion Discord</a></div>`; return;
  }
  const u = me.user; const name = u.discord_global_name || u.discord_username; const avatar = u.discord_avatar || '/assets/trizone-logo-square.jpg';
  const paymentOk = new URLSearchParams(location.search).get('payment') === 'success'; const rank = Trizone.rankLabel(u.minecraft_rank || 'default'); const rankClass = Trizone.rankClass(u.minecraft_rank || 'default');
  root.innerHTML = `
    ${paymentOk ? '<div class="notice good">Paiement terminé. Stripe va confirmer le paiement par webhook ; la livraison Discord et Minecraft se fait ensuite automatiquement.</div>' : ''}
    <div class="profile-layout">
      <aside class="profile-panel"><img class="avatar" src="${Trizone.escapeHtml(avatar)}" alt="Avatar Discord"><h2>${Trizone.escapeHtml(name)}</h2><p>@${Trizone.escapeHtml(u.discord_username)}</p><div class="profile-badges">${me.admin ? '<span class="badge badge-admin">Admin</span>' : ''}${u.minecraft_username ? `<span class="badge ${rankClass}">${Trizone.escapeHtml(rank)}</span>` : '<span class="badge">Minecraft non lié</span>'}</div><div class="profile-actions"><a class="btn btn-quiet" href="/leaderboard.html">Leaderboard duels</a>${me.admin ? '<a class="btn btn-primary" href="/admin.html">Panel admin</a>' : ''}<button class="btn btn-quiet" type="button" data-logout>Déconnexion</button></div></aside>
      <div class="account-stack">
        <section class="panel"><div class="panel-head"><div><h3>Minecraft</h3><p>Le compte lié à ton profil Trizone.</p></div></div>
          ${u.minecraft_username ? `<div class="details-grid"><div><span>Pseudo</span><strong>${Trizone.escapeHtml(u.minecraft_username)}</strong></div><div><span>Grade</span><strong class="rank-text ${rankClass}">${Trizone.escapeHtml(rank)}</strong></div><div><span>UUID</span><strong class="mono">${Trizone.escapeHtml(u.minecraft_uuid)}</strong></div><div><span>Dernière synchro</span><strong>${fmtDate(u.updated_at)}</strong></div></div><div class="inline-actions"><button class="btn btn-quiet" id="generate-code" type="button">Changer de compte lié</button></div><p class="hint">Utilise <code>/link sync</code> sur le Lobby pour synchroniser grade + inventaire + Ender Chest.</p>` : `<p class="muted">Aucun compte Minecraft n’est encore lié.</p><button class="btn btn-primary" id="generate-code" type="button">Générer un code de liaison</button>`}
          <div id="link-code-box"></div></section>
        <section class="panel duel-panel"><div class="panel-head"><div><h3>Statistiques de duel</h3><p>ELO séparé par kit, classement, wins / loses et KDR.</p></div><a class="btn btn-quiet btn-small" href="/leaderboard.html">Leaderboard</a></div><div id="duel-stats-root"><p class="muted">Chargement…</p></div></section>
        <section class="panel inventory-panel"><div class="panel-head"><div><h3>Survie — inventaire & Ender Chest</h3><p>Uniquement l’inventaire du monde <b>world</b> sur le serveur Lobby.</p></div></div><div id="game-data-root"><p class="muted">Chargement…</p></div></section>
        <section class="panel"><div class="panel-head"><div><h3>Grade Discord</h3><p>Trizone-bot attribue automatiquement le rôle correspondant à ton grade payé via Stripe.</p></div></div><p class="hint">Le bot ne modifie que les rôles Copper, Iron, Gold, Diamond et Netherite configurés pour la boutique.</p><div class="inline-actions"><button class="btn btn-quiet" id="sync-discord-rank" type="button">Synchroniser mon rôle Discord</button><button class="btn btn-quiet" id="sync-minecraft-rank" type="button">Synchroniser mon grade Minecraft</button></div><div id="discord-rank-status"></div><div id="minecraft-rank-status"></div></section>
        <section class="panel"><div class="panel-head"><div><h3>Achats</h3><p>Historique des achats confirmés par les webhooks Stripe.</p></div><a class="btn btn-quiet btn-small" href="/shop.html">Boutique</a></div><div id="purchase-list"><p class="muted">Chargement…</p></div></section>
      </div>
    </div>`;
  document.getElementById('generate-code')?.addEventListener('click', generateLinkCode);
  document.getElementById('sync-discord-rank')?.addEventListener('click', syncDiscordRank);
  document.getElementById('sync-minecraft-rank')?.addEventListener('click', syncMinecraftRank);
  loadPurchases(); loadDuels(); loadGameData();
}

document.addEventListener('DOMContentLoaded', loadAccount);
