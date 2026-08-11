function fmtDate(value) { return value ? new Intl.DateTimeFormat('fr-CH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'; }

async function saveAnnouncement() {
  const input = document.getElementById('announcement-input');
  const status = document.getElementById('announcement-status');
  try {
    const result = await Trizone.json('/api/admin/announcement', { method: 'PUT', body: JSON.stringify({ value: input.value }) });
    status.textContent = `Enregistré : ${result.value}`;
  } catch (e) { status.textContent = e.message; }
}

async function loadAdminData() {
  const [stats, users, events, announcement] = await Promise.all([
    Trizone.json('/api/admin/stats'),
    Trizone.json('/api/admin/users'),
    Trizone.json('/api/admin/events'),
    Trizone.json('/api/announcement'),
  ]);

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-num">${stats.users}</div><div class="stat-label">Comptes Discord</div></div>
    <div class="stat"><div class="stat-num">${stats.linked}</div><div class="stat-label">Comptes Minecraft liés</div></div>
    <div class="stat"><div class="stat-num">${stats.payments}</div><div class="stat-label">Paiements complétés reçus</div></div>`;

  document.getElementById('announcement-input').value = announcement.value || '';
  document.getElementById('users-body').innerHTML = users.data.map(u => `<tr><td>${Trizone.escapeHtml(u.discord_global_name || u.discord_username)}</td><td>${Trizone.escapeHtml(u.discord_id)}</td><td>${Trizone.escapeHtml(u.minecraft_username || '—')}</td><td>${fmtDate(u.created_at)}</td><td>${u.banned ? 'Oui' : 'Non'}</td></tr>`).join('');
  document.getElementById('events-body').innerHTML = events.data.map(e => `<tr><td>${Trizone.escapeHtml(e.type)}</td><td>${fmtDate(e.event_date || e.received_at)}</td><td><pre class="json">${Trizone.escapeHtml(JSON.stringify(e.subject, null, 2).slice(0, 1800))}</pre></td></tr>`).join('');
}

async function initAdmin() {
  trizoneHeader('admin'); trizoneFooter(); Trizone.boot();
  const me = await Trizone.loadMe();
  const root = document.getElementById('admin-root');
  if (!me.authenticated || !me.admin) {
    root.innerHTML = '<div class="card"><h2>Accès refusé</h2><p>Ce compte Discord n’est pas déclaré administrateur.</p><div style="margin-top:15px"><a class="btn btn-primary" href="/account.html">Retour au compte</a></div></div>';
    return;
  }

  root.innerHTML = `
    <div class="account-stack">
      <section class="card"><h3>Vue d’ensemble</h3><div id="stats" class="stats"><div class="skeleton"></div></div></section>
      <section class="card"><h3>Annonce du site</h3><textarea id="announcement-input" maxlength="500" placeholder="Message affiché sur l’accueil"></textarea><div style="display:flex;gap:12px;align-items:center;margin-top:12px"><button id="save-announcement" class="btn btn-primary">Enregistrer</button><span id="announcement-status" class="profile-sub"></span></div></section>
      <section class="card"><h3>Utilisateurs</h3><div class="table-wrap"><table><thead><tr><th>Discord</th><th>ID</th><th>Minecraft</th><th>Création</th><th>Banni</th></tr></thead><tbody id="users-body"></tbody></table></div></section>
      <section class="card"><h3>Événements Tebex</h3><div class="table-wrap"><table><thead><tr><th>Type</th><th>Date</th><th>Données</th></tr></thead><tbody id="events-body"></tbody></table></div></section>
    </div>`;
  document.getElementById('save-announcement').addEventListener('click', saveAnnouncement);
  try { await loadAdminData(); } catch (e) { root.insertAdjacentHTML('afterbegin', `<div class="notice bad">${Trizone.escapeHtml(e.message)}</div>`); }
}

document.addEventListener('DOMContentLoaded', initAdmin);
