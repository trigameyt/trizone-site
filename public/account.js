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

async function generateLinkCode() {
  const box = document.getElementById('link-code-box');
  const button = document.getElementById('generate-code');
  if (!box || !button) return;
  button.disabled = true;
  try {
    const data = await Trizone.json('/api/account/link-code', { method: 'POST', body: '{}' });
    box.innerHTML = `
      <div class="link-result">
        <div class="link-code">${Trizone.escapeHtml(data.code)}</div>
        <div>
          <p>Sur le Lobby, tape :</p>
          <div class="command-box">/link ${Trizone.escapeHtml(data.code)}</div>
          <small>Le code reste valable 10 minutes.</small>
        </div>
      </div>`;
  } catch (error) {
    box.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`;
  } finally { button.disabled = false; }
}

async function loadPurchases() {
  const root = document.getElementById('purchase-list');
  if (!root) return;
  try {
    const data = await Trizone.json('/api/account/purchases');
    if (!data.data?.length) {
      root.innerHTML = '<p class="muted">Aucun achat associé à ce compte pour le moment.</p>';
      return;
    }
    root.innerHTML = data.data.map((order) => `
      <div class="list-row">
        <div><strong>${Trizone.escapeHtml(purchaseSummary(order))}</strong><small>${Trizone.escapeHtml(purchaseStatus(order))}</small></div>
        <span>${fmtDate(order.purchased_at || order.updated_at)}</span>
      </div>`).join('');
  } catch (error) {
    root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`;
  }
}


async function syncDiscordRank() {
  const button = document.getElementById('sync-discord-rank');
  const status = document.getElementById('discord-rank-status');
  if (!button || !status) return;
  button.disabled = true;
  status.innerHTML = '<span class="muted">Synchronisation…</span>';
  try {
    const data = await Trizone.json('/api/account/discord-rank/sync', { method: 'POST', body: '{}' });
    const label = data.rank ? Trizone.rankLabel(data.rank) : 'aucun grade payant actif';
    status.innerHTML = `<div class="notice good">Rôle Discord synchronisé : ${Trizone.escapeHtml(label)}.</div>`;
  } catch (error) {
    status.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

async function syncMinecraftRank() {
  const button = document.getElementById('sync-minecraft-rank');
  const status = document.getElementById('minecraft-rank-status');
  if (!button || !status) return;
  button.disabled = true;
  status.innerHTML = '<span class="muted">Mise en file de livraison…</span>';
  try {
    const data = await Trizone.json('/api/account/minecraft-rank/sync', { method: 'POST', body: '{}' });
    const label = Trizone.rankLabel(data.rank || 'default');
    status.innerHTML = `<div class="notice good">Synchronisation Minecraft demandée : ${Trizone.escapeHtml(label)}. Le plugin la récupère automatiquement.</div>`;
  } catch (error) {
    status.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

async function loadAccount() {
  trizoneHeader('account');
  trizoneFooter();
  const { me } = await Trizone.boot();
  const root = document.getElementById('account-root');

  if (!me.authenticated) {
    root.innerHTML = `
      <div class="empty-state">
        <img src="/assets/trizone-logo-square.jpg" alt="Logo Trizone">
        <h2>Connecte ton Discord</h2>
        <p>Trizone ne te demande pas de créer un mot de passe supplémentaire.</p>
        <a class="btn btn-primary" href="/auth/discord">Connexion Discord</a>
      </div>`;
    return;
  }

  const u = me.user;
  const name = u.discord_global_name || u.discord_username;
  const avatar = u.discord_avatar || '/assets/trizone-logo-square.jpg';
  const paymentOk = new URLSearchParams(location.search).get('payment') === 'success';
  const rank = Trizone.rankLabel(u.minecraft_rank || 'default');
  const rankClass = Trizone.rankClass(u.minecraft_rank || 'default');

  root.innerHTML = `
    ${paymentOk ? '<div class="notice good">Paiement terminé. Stripe va confirmer le paiement par webhook ; la livraison Discord et Minecraft se fait ensuite automatiquement.</div>' : ''}
    <div class="profile-layout">
      <aside class="profile-panel">
        <img class="avatar" src="${Trizone.escapeHtml(avatar)}" alt="Avatar Discord">
        <h2>${Trizone.escapeHtml(name)}</h2>
        <p>@${Trizone.escapeHtml(u.discord_username)}</p>
        <div class="profile-badges">
          ${me.admin ? '<span class="badge badge-admin">Admin</span>' : ''}
          ${u.minecraft_username ? `<span class="badge ${rankClass}">${Trizone.escapeHtml(rank)}</span>` : '<span class="badge">Minecraft non lié</span>'}
        </div>
        <div class="profile-actions">
          ${me.admin ? '<a class="btn btn-primary" href="/admin.html">Panel admin</a>' : ''}
          <button class="btn btn-quiet" type="button" data-logout>Déconnexion</button>
        </div>
      </aside>

      <div class="account-stack">
        <section class="panel">
          <div class="panel-head"><div><h3>Minecraft</h3><p>Le compte lié à ton profil Trizone.</p></div></div>
          ${u.minecraft_username ? `
            <div class="details-grid">
              <div><span>Pseudo</span><strong>${Trizone.escapeHtml(u.minecraft_username)}</strong></div>
              <div><span>Grade</span><strong class="rank-text ${rankClass}">${Trizone.escapeHtml(rank)}</strong></div>
              <div><span>UUID</span><strong class="mono">${Trizone.escapeHtml(u.minecraft_uuid)}</strong></div>
              <div><span>Dernière synchro</span><strong>${fmtDate(u.updated_at)}</strong></div>
            </div>
            <div class="inline-actions">
              <button class="btn btn-quiet" id="generate-code" type="button">Changer de compte lié</button>
            </div>
            <p class="hint">Si ton grade change en jeu, utilise <code>/link sync</code> sur le Lobby pour le mettre à jour sur le site.</p>
          ` : `
            <p class="muted">Aucun compte Minecraft n’est encore lié.</p>
            <button class="btn btn-primary" id="generate-code" type="button">Générer un code de liaison</button>
          `}
          <div id="link-code-box"></div>
        </section>


        <section class="panel">
          <div class="panel-head">
            <div>
              <h3>Grade Discord</h3>
              <p>Trizone-bot attribue automatiquement le rôle correspondant à ton grade payé via Stripe.</p>
            </div>
          </div>
          <p class="hint">Le bot ne modifie que les rôles Copper, Iron, Gold, Diamond et Netherite configurés pour la boutique.</p>
          <div class="inline-actions">
            <button class="btn btn-quiet" id="sync-discord-rank" type="button">Synchroniser mon rôle Discord</button>
            <button class="btn btn-quiet" id="sync-minecraft-rank" type="button">Synchroniser mon grade Minecraft</button>
          </div>
          <div id="discord-rank-status"></div>
          <div id="minecraft-rank-status"></div>
        </section>

        <section class="panel">
          <div class="panel-head"><div><h3>Achats</h3><p>Historique des achats confirmés par les webhooks Stripe.</p></div><a class="btn btn-quiet btn-small" href="/shop.html">Boutique</a></div>
          <div id="purchase-list"><p class="muted">Chargement…</p></div>
        </section>
      </div>
    </div>`;

  document.getElementById('generate-code')?.addEventListener('click', generateLinkCode);
  document.getElementById('sync-discord-rank')?.addEventListener('click', syncDiscordRank);
  document.getElementById('sync-minecraft-rank')?.addEventListener('click', syncMinecraftRank);
  loadPurchases();
}

document.addEventListener('DOMContentLoaded', loadAccount);
