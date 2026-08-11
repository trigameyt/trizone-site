function fmtDate(value) { return value ? new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }

function eventSummary(event) {
  const s = event.subject || {};
  const products = Array.isArray(s.products) ? s.products.map(p => p.name).filter(Boolean).join(', ') : '';
  const amount = s.price_paid?.amount ?? s.price?.amount;
  const currency = s.price_paid?.currency ?? s.price?.currency ?? '';
  return `${products || event.type}${amount != null ? ` — ${amount} ${currency}` : ''}`;
}

async function generateLinkCode() {
  const box = document.getElementById('link-code-box');
  try {
    const data = await Trizone.json('/api/account/link-code', { method: 'POST', body: '{}' });
    box.innerHTML = `<div class="link-code">${Trizone.escapeHtml(data.code)}</div><p>Dans Minecraft, connecté sur Trizone :</p><div class="command-box">/link ${Trizone.escapeHtml(data.code)}</div><p style="margin-top:10px">Le code expire dans 10 minutes.</p>`;
  } catch (e) { box.textContent = e.message; }
}

async function loadPurchases() {
  const root = document.getElementById('purchase-list');
  try {
    const data = await Trizone.json('/api/account/purchases');
    if (!data.data?.length) { root.innerHTML = '<p>Aucun achat Tebex associé pour le moment.</p>'; return; }
    root.innerHTML = data.data.map(e => `<div class="info-row"><div><div style="font-weight:700">${Trizone.escapeHtml(eventSummary(e))}</div><div class="profile-sub">${Trizone.escapeHtml(e.type)}</div></div><div class="info-value">${fmtDate(e.event_date || e.received_at)}</div></div>`).join('');
  } catch (e) { root.innerHTML = `<p>${Trizone.escapeHtml(e.message)}</p>`; }
}

async function loadAccount() {
  trizoneHeader('account'); trizoneFooter(); Trizone.boot();
  const me = await Trizone.loadMe();
  const root = document.getElementById('account-root');

  if (!me.authenticated) {
    root.innerHTML = `<div class="card" style="max-width:620px;margin:auto;text-align:center"><img class="brand-mark" style="width:82px;height:82px" src="/assets/trizone-logo-square.jpg" alt="Trizone"><h2>Connecte-toi à Trizone</h2><p style="color:var(--muted)">La connexion passe par Discord. Aucun mot de passe n’est stocké par Trizone.</p><div style="margin-top:18px"><a class="btn btn-primary" href="/auth/discord">Connexion avec Discord</a></div></div>`;
    return;
  }

  const u = me.user;
  const name = u.discord_global_name || u.discord_username;
  const avatar = u.discord_avatar || '/assets/trizone-logo-square.jpg';
  const paymentOk = new URLSearchParams(location.search).get('payment') === 'success';

  root.innerHTML = `
    ${paymentOk ? '<div class="notice good">Paiement terminé. La confirmation définitive arrive par webhook Tebex et la livraison est gérée côté serveur.</div>' : ''}
    <div class="account-layout">
      <aside class="card profile-card">
        <img class="avatar" src="${Trizone.escapeHtml(avatar)}" alt="Avatar Discord">
        <div class="profile-name">${Trizone.escapeHtml(name)}</div>
        <div class="profile-sub">@${Trizone.escapeHtml(u.discord_username)}</div>
        ${me.admin ? '<div class="badge">ADMIN TRIZONE</div>' : '<div class="badge">JOUEUR</div>'}
        <div style="display:grid;gap:8px;margin-top:22px">
          ${me.admin ? '<a class="btn btn-primary" href="/admin.html">Panel admin</a>' : ''}
          <button class="btn btn-ghost" data-logout>Déconnexion</button>
        </div>
      </aside>
      <div class="account-stack">
        <section class="card"><h3>Compte Minecraft</h3>
          ${u.minecraft_username ? `
            <div class="notice good">Compte lié ✓</div>
            <div class="info-row"><span class="info-label">Pseudo</span><span class="info-value">${Trizone.escapeHtml(u.minecraft_username)}</span></div>
            <div class="info-row"><span class="info-label">UUID</span><span class="info-value">${Trizone.escapeHtml(u.minecraft_uuid)}</span></div>
            <div class="info-row"><span class="info-label">Lié le</span><span class="info-value">${fmtDate(u.linked_at)}</span></div>
            <div style="margin-top:15px"><button class="btn btn-ghost" id="generate-code">Relier un autre compte</button></div>
          ` : `
            <p>Génère un code puis utilise-le en jeu. Le plugin vérifie le code côté serveur web avant de lier ton UUID.</p>
            <div style="margin-top:16px"><button class="btn btn-primary" id="generate-code">Générer mon code</button></div>
          `}
          <div id="link-code-box" style="margin-top:16px"></div>
        </section>
        <section class="card"><h3>Historique Tebex</h3><div id="purchase-list"><p>Chargement…</p></div></section>
      </div>
    </div>`;

  document.getElementById('generate-code')?.addEventListener('click', generateLinkCode);
  document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', async()=>{ await Trizone.json('/auth/logout',{method:'POST',body:'{}'}).catch(()=>{}); location.href='/'; }));
  loadPurchases();
}

document.addEventListener('DOMContentLoaded', loadAccount);
