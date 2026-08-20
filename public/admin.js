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
let duelKits = [];

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


function renderDuelKitOrder() {
  const root = document.getElementById('duel-kit-order-list');
  if (!root) return;
  if (!duelKits.length) {
    root.innerHTML = '<div class="empty-state compact-empty"><p>Aucun kit synchronisé.</p></div>';
    return;
  }
  root.innerHTML = duelKits.map((kit, index) => `
    <div class="kit-order-row" data-kit-key="${Trizone.escapeHtml(kit.key)}">
      <span class="kit-order-index">#${index + 1}</span>
      <span class="kit-order-icon">${Trizone.minecraftIconHtml(kit.icon, kit.emoji || '⚔', 'mc-icon-order')}</span>
      <div class="kit-order-info">
        <strong>${Trizone.escapeHtml(kit.name || kit.key)}</strong>
        <small>${Trizone.escapeHtml(kit.key)}</small>
      </div>
      <div class="kit-order-actions">
        <button class="btn btn-quiet btn-tiny" type="button" data-kit-order-action="first" aria-label="Mettre en premier">⇤</button>
        <button class="btn btn-quiet btn-tiny" type="button" data-kit-order-action="up" aria-label="Monter">←</button>
        <button class="btn btn-quiet btn-tiny" type="button" data-kit-order-action="down" aria-label="Descendre">→</button>
        <button class="btn btn-quiet btn-tiny" type="button" data-kit-order-action="last" aria-label="Mettre en dernier">⇥</button>
      </div>
    </div>`).join('');
  Trizone.bindMinecraftIcons(root);
}

function moveDuelKit(key, action) {
  const index = duelKits.findIndex((kit) => kit.key === key);
  if (index < 0) return;
  const [kit] = duelKits.splice(index, 1);
  let target = index;
  if (action === 'first') target = 0;
  if (action === 'last') target = duelKits.length;
  if (action === 'up') target = Math.max(0, index - 1);
  if (action === 'down') target = Math.min(duelKits.length, index + 1);
  duelKits.splice(target, 0, kit);
  renderDuelKitOrder();
}

function handleDuelKitOrderClick(event) {
  const button = event.target.closest('[data-kit-order-action]');
  if (!button) return;
  const row = button.closest('[data-kit-key]');
  if (!row) return;
  moveDuelKit(row.dataset.kitKey, button.dataset.kitOrderAction);
}

async function saveDuelKitOrder() {
  const button = document.getElementById('save-duel-kit-order');
  const status = document.getElementById('duel-kit-order-status');
  if (!button) return;
  button.disabled = true;
  if (status) status.textContent = 'Synchronisation…';
  try {
    const result = await Trizone.json('/api/admin/duels/kits/order', {
      method: 'PUT',
      body: JSON.stringify({ order: duelKits.map((kit) => kit.key) }),
    });
    duelKits = result.kits || duelKits;
    renderDuelKitOrder();
    if (status) status.textContent = 'Ordre sauvegardé. /kit le récupère automatiquement.';
    Trizone.showToast('Ordre des kits mis à jour.');
  } catch (error) {
    if (status) status.textContent = error.message;
    Trizone.showToast(error.message, 'bad');
  } finally {
    button.disabled = false;
  }
}


let adminServers = [];
let consoleSource = null;
let consoleLines = [];

function formatAdminBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MiB';
  const mib = bytes / 1024 / 1024;
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(mib >= 100 ? 0 : 1)} MiB`;
}

function setConsoleConnection(text, kind = '') {
  const el = document.getElementById('console-connection');
  if (!el) return;
  el.textContent = text;
  el.className = `badge console-connection ${kind}`.trim();
}

function appendConsoleLine(line) {
  const terminal = document.getElementById('admin-console-output');
  if (!terminal) return;
  const clean = String(line || '').replace(/\r/g, '');
  for (const part of clean.split('\n')) {
    if (!part) continue;
    consoleLines.push(part);
  }
  if (consoleLines.length > 500) consoleLines = consoleLines.slice(-500);
  terminal.textContent = consoleLines.join('\n');
  terminal.scrollTop = terminal.scrollHeight;
}

function renderAdminServerPicker() {
  const select = document.getElementById('console-server-select');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = adminServers.map((server) => `<option value="${Trizone.escapeHtml(server.id)}">${Trizone.escapeHtml(server.name)} — ${Trizone.escapeHtml(server.state_label || 'Inconnu')}</option>`).join('');
  if (adminServers.some((server) => server.id === previous)) select.value = previous;
}

function renderAdminServerStats(server) {
  const root = document.getElementById('console-server-stats');
  if (!root) return;
  if (!server) {
    root.innerHTML = '<span class="muted">Aucun serveur sélectionné.</span>';
    return;
  }
  const memory = server.memory_limit_bytes
    ? `${formatAdminBytes(server.memory_bytes)} / ${formatAdminBytes(server.memory_limit_bytes)}`
    : formatAdminBytes(server.memory_bytes);
  root.innerHTML = `
    <div><span>État</span><strong>${Trizone.escapeHtml(server.state_label || 'Inconnu')}</strong></div>
    <div><span>CPU</span><strong>${Number(server.cpu_percent || 0).toFixed(1)}%</strong></div>
    <div><span>RAM</span><strong>${Trizone.escapeHtml(memory)}</strong></div>`;
}

function closeAdminConsoleStream() {
  if (consoleSource) {
    consoleSource.close();
    consoleSource = null;
  }
}

function connectAdminConsole() {
  closeAdminConsoleStream();
  const select = document.getElementById('console-server-select');
  const id = select?.value;
  const server = adminServers.find((item) => item.id === id);
  renderAdminServerStats(server);
  consoleLines = [];
  const terminal = document.getElementById('admin-console-output');
  if (terminal) terminal.textContent = '';
  if (!id) return;

  setConsoleConnection('Connexion…', 'is-warn');
  appendConsoleLine(`[Trizone] Connexion à la console ${server?.name || id}…`);
  const source = new EventSource(`/api/admin/servers/${encodeURIComponent(id)}/console-stream`);
  consoleSource = source;

  source.addEventListener('console', (event) => {
    try { appendConsoleLine(JSON.parse(event.data).line); } catch {}
  });
  source.addEventListener('state', (event) => {
    try {
      const data = JSON.parse(event.data);
      const connected = data.state === 'connected';
      setConsoleConnection(data.label || data.state, connected ? 'is-online' : 'is-warn');
    } catch {}
  });
  source.addEventListener('server-state', (event) => {
    try {
      const data = JSON.parse(event.data);
      const current = adminServers.find((item) => item.id === id);
      if (current && data.state) {
        current.raw_state = data.state;
        current.state_label = data.state;
        renderAdminServerStats(current);
      }
    } catch {}
  });
  source.addEventListener('stats', (event) => {
    try {
      const data = JSON.parse(event.data);
      const current = adminServers.find((item) => item.id === id);
      if (!current) return;
      current.cpu_percent = Number(data.cpu_absolute ?? data.cpu_percent ?? current.cpu_percent ?? 0);
      current.memory_bytes = Number(data.memory_bytes ?? data.memory ?? current.memory_bytes ?? 0);
      renderAdminServerStats(current);
    } catch {}
  });
  source.addEventListener('error', (event) => {
    if (event?.data) {
      try { appendConsoleLine(`[Trizone] ${JSON.parse(event.data).error}`); } catch {}
    }
    setConsoleConnection('Déconnectée', 'is-offline');
  });
  source.onerror = () => setConsoleConnection('Reconnexion…', 'is-warn');
}

async function loadAdminServers() {
  const result = await Trizone.json('/api/admin/servers');
  adminServers = result.data || [];
  renderAdminServerPicker();
  connectAdminConsole();
}

async function sendAdminCommand(event) {
  event?.preventDefault();
  const select = document.getElementById('console-server-select');
  const input = document.getElementById('console-command-input');
  const id = select?.value;
  const command = String(input?.value || '').trim();
  if (!id || !command) return;
  input.disabled = true;
  try {
    await Trizone.json(`/api/admin/servers/${encodeURIComponent(id)}/command`, {
      method: 'POST', body: JSON.stringify({ command }),
    });
    appendConsoleLine(`> ${command}`);
    input.value = '';
  } catch (error) {
    Trizone.showToast(error.message, 'bad');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function sendAdminPower(signal) {
  const select = document.getElementById('console-server-select');
  const id = select?.value;
  if (!id) return;
  const server = adminServers.find((item) => item.id === id);
  const label = server?.name || id;
  if ((signal === 'stop' || signal === 'restart') && !confirm(`${signal === 'stop' ? 'Arrêter' : 'Redémarrer'} ${label} ?`)) return;
  try {
    await Trizone.json(`/api/admin/servers/${encodeURIComponent(id)}/power`, {
      method: 'POST', body: JSON.stringify({ signal }),
    });
    Trizone.showToast(`Action ${signal} envoyée à ${label}.`);
    setTimeout(async () => {
      try {
        const result = await Trizone.json('/api/admin/servers');
        adminServers = result.data || adminServers;
        renderAdminServerPicker();
        renderAdminServerStats(adminServers.find((item) => item.id === id));
      } catch {}
    }, 1800);
  } catch (error) {
    Trizone.showToast(error.message, 'bad');
  }
}

async function loadAdminData(config) {
  const [stats, users, events, kitOrder] = await Promise.all([
    Trizone.json('/api/admin/stats'),
    Trizone.json('/api/admin/users'),
    Trizone.json('/api/admin/events'),
    Trizone.json('/api/admin/duels/kits/order'),
  ]);

  document.getElementById('stats').innerHTML = `
    <div class="stat"><strong>${stats.users}</strong><span>Comptes Discord</span></div>
    <div class="stat"><strong>${stats.linked}</strong><span>Minecraft liés</span></div>
    <div class="stat"><strong>${stats.payments}</strong><span>Paiements reçus</span></div>
    <div class="stat"><strong>${stats.banned}</strong><span>Comptes bannis</span></div>`;

  document.querySelectorAll('[data-setting]').forEach((input) => { input.value = config[input.dataset.setting] ?? ''; });
  allUsers = users.data || [];
  renderUserRows(allUsers);
  duelKits = kitOrder.kits || [];
  renderDuelKitOrder();

  const eventsRoot = document.getElementById('events-list');
  eventsRoot.innerHTML = events.data?.length
    ? events.data.map((e) => `<details class="event-item"><summary><strong>${Trizone.escapeHtml(e.type)}</strong><span>${fmtDate(e.event_date || e.received_at)}</span></summary>${e.process_error ? `<div class="notice bad">${Trizone.escapeHtml(e.process_error)}</div>` : ''}<pre>${Trizone.escapeHtml(JSON.stringify(e.subject, null, 2).slice(0, 5000))}</pre></details>`).join('')
    : '<p class="muted">Aucun événement Stripe reçu.</p>';
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

      <section class="panel admin-console-panel">
        <div class="panel-head">
          <div><h3>Console des serveurs</h3><p>Console Calagopus en direct. Les clés API restent uniquement côté serveur.</p></div>
          <div class="console-head-actions"><select id="console-server-select" class="console-server-select" aria-label="Serveur"></select><span id="console-connection" class="badge console-connection">Déconnectée</span></div>
        </div>
        <div id="console-server-stats" class="console-server-stats"><span class="muted">Chargement…</span></div>
        <pre id="admin-console-output" class="admin-console-output" aria-live="polite">Chargement de la console…</pre>
        <form id="admin-console-form" class="admin-console-form">
          <span class="console-prompt">&gt;</span>
          <input id="console-command-input" type="text" maxlength="1000" autocomplete="off" spellcheck="false" placeholder="say Bonjour Trizone">
          <button class="btn btn-primary btn-small" type="submit">Envoyer</button>
        </form>
        <div class="console-power-actions">
          <button class="btn btn-quiet btn-small" type="button" data-power="start">Démarrer</button>
          <button class="btn btn-quiet btn-small" type="button" data-power="restart">Redémarrer</button>
          <button class="btn btn-danger btn-small" type="button" data-power="stop">Arrêter</button>
        </div>
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
        <div class="panel-head"><div><h3>Ordre des kits Duels</h3><p>Le même ordre est utilisé dans le menu <strong>/kit</strong> et dans les onglets du leaderboard.</p></div><span class="badge">Synchro réseau</span></div>
        <div id="duel-kit-order-list" class="kit-order-list"><p class="muted">Chargement…</p></div>
        <div class="save-bar"><button class="btn btn-primary" id="save-duel-kit-order" type="button">Sauvegarder l'ordre</button><span id="duel-kit-order-status" class="muted"></span></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Joueurs</h3><p>Grade affiché sur le site, bannissement et liaison Minecraft.</p></div><input class="search-input" id="user-search" type="search" placeholder="Pseudo, Discord ID, grade…"></div>
        <div class="table-wrap"><table><thead><tr><th>Discord</th><th>ID</th><th>Minecraft</th><th>Grade</th><th>État</th><th>Actions</th></tr></thead><tbody id="users-body"></tbody></table></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Événements Stripe</h3><p>Derniers webhooks Stripe reçus et état de leur traitement.</p></div></div>
        <div id="events-list" class="events-list"><p class="muted">Chargement…</p></div>
      </section>
    </div>`;

  document.getElementById('save-site').addEventListener('click', saveSiteSettings);
  document.getElementById('save-duel-kit-order').addEventListener('click', saveDuelKitOrder);
  document.getElementById('duel-kit-order-list').addEventListener('click', handleDuelKitOrderClick);
  document.getElementById('user-search').addEventListener('input', filterUsers);
  document.getElementById('users-body').addEventListener('click', handleUserAction);
  document.getElementById('console-server-select').addEventListener('change', connectAdminConsole);
  document.getElementById('admin-console-form').addEventListener('submit', sendAdminCommand);
  document.querySelectorAll('[data-power]').forEach((button) => button.addEventListener('click', () => sendAdminPower(button.dataset.power)));

  try { await loadAdminData(config); await loadAdminServers(); }
  catch (error) { root.insertAdjacentHTML('afterbegin', `<div class="notice bad">${Trizone.escapeHtml(error.message)}</div>`); }
}

window.addEventListener('beforeunload', closeAdminConsoleStream);
document.addEventListener('DOMContentLoaded', initAdmin);
