function fmtDate(value) {
  return value ? new Intl.DateTimeFormat('fr-CH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
}

const siteFields = [
  ['announcement', 'Annonce', 'textarea', 'Message court affiché sous l’accueil. Laisse vide pour la masquer.'],
  ['home_title', 'Titre principal', 'text', 'Ex. TRIZONE'],
  ['home_description', 'Description de Trizone', 'textarea', 'Le texte principal de l’accueil.'],
  ['server_address', 'Adresse du serveur', 'text', 'Ex. play.trizone.club'],
  ['server_tagline', 'Résumé serveur', 'text', 'Ex. Survie • PvP • Duels • Java & Bedrock'],
  ['feature_1_title', 'Bloc 1 — titre', 'text', ''],
  ['feature_1_text', 'Bloc 1 — texte', 'textarea', ''],
  ['feature_2_title', 'Bloc 2 — titre', 'text', ''],
  ['feature_2_text', 'Bloc 2 — texte', 'textarea', ''],
  ['feature_3_title', 'Bloc 3 — titre', 'text', ''],
  ['feature_3_text', 'Bloc 3 — texte', 'textarea', ''],
  ['discord_invite_url', 'Lien Discord', 'text', 'Laisse vide pour masquer le bouton Discord.'],
  ['status_title', 'Section état — titre', 'text', 'Ex. État du réseau'],
  ['status_description', 'Section état — description', 'text', 'Texte affiché au-dessus de l’uptime.'],
];

const legalFields = [
  ['legal_operator_name', 'Nom / identité de l’exploitant', 'text', 'À compléter avant l’ouverture des paiements.'],
  ['legal_contact_address', 'Adresse de contact', 'textarea', 'Adresse de contact de l’exploitant.'],
  ['legal_contact_email', 'E-mail de contact', 'text', 'E-mail valable pour les demandes liées au site / boutique.'],
  ['privacy_contact_email', 'E-mail vie privée', 'text', 'Peut être le même que l’e-mail de contact.'],
  ['legal_extra_terms', 'Conditions supplémentaires', 'textarea', 'Règles propres à Trizone qui viennent compléter les conditions affichées.'],
];

let allUsers = [];

function fieldHtml([key, label, type, help]) {
  return `<label class="form-field">
    <span>${Trizone.escapeHtml(label)}</span>
    ${type === 'textarea'
      ? `<textarea data-setting="${key}" rows="${key === 'legal_extra_terms' ? 7 : 4}"></textarea>`
      : `<input type="text" data-setting="${key}">`}
    ${help ? `<small>${Trizone.escapeHtml(help)}</small>` : ''}
  </label>`;
}

function renderUserRows(users) {
  const body = document.getElementById('users-body');
  if (!body) return;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">Aucun résultat.</td></tr>';
    return;
  }
  body.innerHTML = users.map((u) => `
    <tr data-user-row="${Trizone.escapeHtml(u.discord_id)}">
      <td><strong>${Trizone.escapeHtml(u.discord_global_name || u.discord_username)}</strong><small>@${Trizone.escapeHtml(u.discord_username)}</small></td>
      <td><span class="mono small">${Trizone.escapeHtml(u.discord_id)}</span></td>
      <td>${u.minecraft_username ? `<strong>${Trizone.escapeHtml(u.minecraft_username)}</strong><small class="mono">${Trizone.escapeHtml(u.minecraft_uuid)}</small>` : '<span class="muted">Non lié</span>'}</td>
      <td>${u.minecraft_username ? `<input class="table-input" type="text" maxlength="32" value="${Trizone.escapeHtml(u.minecraft_rank || 'default')}" data-rank-input>` : '—'}</td>
      <td>${u.banned ? '<span class="badge badge-danger">Banni</span>' : '<span class="badge">Actif</span>'}</td>
      <td class="actions-cell">
        ${u.minecraft_username ? '<button class="btn btn-quiet btn-tiny" type="button" data-action="save-rank">Grade</button><button class="btn btn-quiet btn-tiny" type="button" data-action="unlink">Délier</button>' : ''}
        <button class="btn ${u.banned ? 'btn-quiet' : 'btn-danger'} btn-tiny" type="button" data-action="toggle-ban" data-banned="${u.banned}">${u.banned ? 'Débannir' : 'Bannir'}</button>
      </td>
    </tr>`).join('');
}

async function saveSiteSettings() {
  const button = document.getElementById('save-site');
  const status = document.getElementById('site-save-status');
  const values = {};
  document.querySelectorAll('[data-setting]').forEach((input) => { values[input.dataset.setting] = input.value; });
  button.disabled = true;
  status.textContent = 'Enregistrement…';
  try {
    const result = await Trizone.json('/api/admin/site-config', { method: 'PUT', body: JSON.stringify({ values }) });
    status.textContent = 'Modifications enregistrées.';
    Trizone.state.config = result.values;
    Trizone.applySiteConfig(result.values);
    Trizone.showToast('Site mis à jour.');
  } catch (error) {
    status.textContent = error.message;
    Trizone.showToast(error.message, 'bad');
  } finally { button.disabled = false; }
}

async function handleUserAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const row = button.closest('[data-user-row]');
  const discordId = row?.dataset.userRow;
  if (!discordId) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'save-rank') {
      const rank = row.querySelector('[data-rank-input]').value;
      await Trizone.json(`/api/admin/users/${encodeURIComponent(discordId)}`, { method: 'PUT', body: JSON.stringify({ minecraft_rank: rank }) });
      Trizone.showToast('Grade enregistré.');
    }
    if (button.dataset.action === 'toggle-ban') {
      const banned = button.dataset.banned === 'true';
      await Trizone.json(`/api/admin/users/${encodeURIComponent(discordId)}`, { method: 'PUT', body: JSON.stringify({ banned: !banned }) });
      await reloadUsers();
      Trizone.showToast(banned ? 'Joueur débanni.' : 'Joueur banni.');
    }
    if (button.dataset.action === 'unlink') {
      if (!confirm('Délier ce compte Minecraft du compte Discord ?')) return;
      await Trizone.json(`/api/admin/users/${encodeURIComponent(discordId)}/minecraft`, { method: 'DELETE' });
      await reloadUsers();
      Trizone.showToast('Compte Minecraft délié.');
    }
  } catch (error) {
    Trizone.showToast(error.message, 'bad');
  } finally { button.disabled = false; }
}

async function reloadUsers() {
  const users = await Trizone.json('/api/admin/users');
  allUsers = users.data || [];
  filterUsers();
}

function filterUsers() {
  const q = String(document.getElementById('user-search')?.value || '').trim().toLowerCase();
  if (!q) return renderUserRows(allUsers);
  renderUserRows(allUsers.filter((u) => [u.discord_global_name, u.discord_username, u.discord_id, u.minecraft_username, u.minecraft_rank]
    .some((value) => String(value || '').toLowerCase().includes(q))));
}

async function loadAdminData(config) {
  const [stats, users, events] = await Promise.all([
    Trizone.json('/api/admin/stats'),
    Trizone.json('/api/admin/users'),
    Trizone.json('/api/admin/events'),
  ]);

  document.getElementById('stats').innerHTML = `
    <div class="stat"><strong>${stats.users}</strong><span>Comptes Discord</span></div>
    <div class="stat"><strong>${stats.linked}</strong><span>Minecraft liés</span></div>
    <div class="stat"><strong>${stats.payments}</strong><span>Paiements reçus</span></div>
    <div class="stat"><strong>${stats.banned}</strong><span>Comptes bannis</span></div>`;

  document.querySelectorAll('[data-setting]').forEach((input) => { input.value = config[input.dataset.setting] ?? ''; });
  allUsers = users.data || [];
  renderUserRows(allUsers);

  const eventsRoot = document.getElementById('events-list');
  eventsRoot.innerHTML = events.data?.length
    ? events.data.map((e) => `<details class="event-item"><summary><strong>${Trizone.escapeHtml(e.type)}</strong><span>${fmtDate(e.event_date || e.received_at)}</span></summary><pre>${Trizone.escapeHtml(JSON.stringify(e.subject, null, 2).slice(0, 5000))}</pre></details>`).join('')
    : '<p class="muted">Aucun événement Tebex reçu.</p>';
}

async function initAdmin() {
  trizoneHeader('admin');
  trizoneFooter();
  const { me, config } = await Trizone.boot();
  const root = document.getElementById('admin-root');
  if (!me.authenticated || !me.admin) {
    root.innerHTML = '<div class="empty-state"><h2>Accès refusé</h2><p>Ce compte Discord n’est pas déclaré administrateur.</p><a class="btn btn-primary" href="/account.html">Retour au compte</a></div>';
    return;
  }

  root.innerHTML = `
    <div class="admin-stack">
      <section class="panel">
        <div class="panel-head"><div><h3>Vue d’ensemble</h3><p>État rapide des comptes et paiements.</p></div><a class="btn btn-quiet btn-small" href="/" target="_blank" rel="noopener">Voir le site</a></div>
        <div id="stats" class="stats"><div class="skeleton"></div></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Modifier le site</h3><p>Ces changements sont visibles directement sur l’accueil.</p></div></div>
        <div class="form-grid">${siteFields.map(fieldHtml).join('')}</div>
        <hr class="divider">
        <div class="panel-head"><div><h3>Informations légales — Suisse</h3><p>Renseigne une identité, une adresse de contact et un e-mail avant d’ouvrir les paiements.</p></div><a class="btn btn-quiet btn-small" href="/legal.html" target="_blank" rel="noopener">Voir la page</a></div>
        <div class="form-grid">${legalFields.map(fieldHtml).join('')}</div>
        <div class="save-bar"><button class="btn btn-primary" id="save-site" type="button">Enregistrer le site</button><span id="site-save-status" class="muted"></span></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Joueurs</h3><p>Grade affiché sur le site, bannissement et liaison Minecraft.</p></div><input class="search-input" id="user-search" type="search" placeholder="Pseudo, Discord ID, grade…"></div>
        <div class="table-wrap"><table><thead><tr><th>Discord</th><th>ID</th><th>Minecraft</th><th>Grade</th><th>État</th><th>Actions</th></tr></thead><tbody id="users-body"></tbody></table></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Événements Tebex</h3><p>Derniers webhooks reçus par le site.</p></div></div>
        <div id="events-list" class="events-list"><p class="muted">Chargement…</p></div>
      </section>
    </div>`;

  document.getElementById('save-site').addEventListener('click', saveSiteSettings);
  document.getElementById('user-search').addEventListener('input', filterUsers);
  document.getElementById('users-body').addEventListener('click', handleUserAction);

  try { await loadAdminData(config); }
  catch (error) { root.insertAdjacentHTML('afterbegin', `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`); }
}

document.addEventListener('DOMContentLoaded', initAdmin);
