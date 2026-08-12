function fmtDate(value) {
  return value ? new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function eventSummary(event) {
  const s = event.subject || {};
  const products = Array.isArray(s.products) ? s.products.map((p) => p.name).filter(Boolean).join(', ') : '';
  const amount = s.price_paid?.amount ?? s.price?.amount;
  const currency = s.price_paid?.currency ?? s.price?.currency ?? '';
  return `${products || 'Achat Tebex'}${amount != null ? ` — ${amount} ${currency}` : ''}`;
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
    root.innerHTML = data.data.map((event) => `
      <div class="list-row">
        <div><strong>${Trizone.escapeHtml(eventSummary(event))}</strong><small>${Trizone.escapeHtml(event.type)}</small></div>
        <span>${fmtDate(event.event_date || event.received_at)}</span>
      </div>`).join('');
  } catch (error) {
    root.innerHTML = `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`;
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
    ${paymentOk ? '<div class="notice good">Paiement terminé. Tebex va maintenant confirmer et livrer l’achat au serveur.</div>' : ''}
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
          <div class="panel-head"><div><h3>Achats</h3><p>Historique reçu par les webhooks Tebex.</p></div><a class="btn btn-quiet btn-small" href="/shop.html">Boutique</a></div>
          <div id="purchase-list"><p class="muted">Chargement…</p></div>
        </section>
      </div>
    </div>`;

  document.getElementById('generate-code')?.addEventListener('click', generateLinkCode);
  loadPurchases();
}

document.addEventListener('DOMContentLoaded', loadAccount);
