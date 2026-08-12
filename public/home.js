function stateLabelClass(state) {
  if (state === 'up') return 'is-online';
  if (state === 'warn') return 'is-warn';
  return 'is-offline';
}

function renderHistory(history) {
  const values = Array.isArray(history) ? history.slice(-60) : [];
  while (values.length < 60) values.unshift('down');
  return values.map((state) => {
    const safe = ['up', 'warn', 'down'].includes(state) ? state : 'down';
    const label = safe === 'up' ? 'Disponible' : safe === 'warn' ? 'Dégradé' : 'Indisponible';
    return `<span class="uptime-bar is-${safe}" title="${label}"></span>`;
  }).join('');
}

function renderStatusBoard(data) {
  const root = document.getElementById('status-board');
  const summary = document.getElementById('status-summary');
  if (!root || !summary) return;

  const services = Array.isArray(data?.services) ? data.services : [];
  if (!services.length) {
    root.innerHTML = '<div class="uptime-loading">Aucun service à afficher.</div>';
    summary.className = 'status-summary is-offline';
    summary.innerHTML = '<span class="status-summary-dot"></span><span>Statut indisponible</span>';
    return;
  }

  const hasDown = services.some((service) => service.state === 'down');
  const hasWarn = services.some((service) => service.state === 'warn');
  const configuredServices = services.filter((service) => service.configured !== false);
  const globalPercent = configuredServices.length
    ? configuredServices.reduce((sum, service) => sum + Math.max(0, Math.min(100, Number(service.uptime_percent || 0))), 0) / configuredServices.length
    : 0;

  summary.className = `status-summary ${hasDown ? 'is-offline' : hasWarn ? 'is-warn' : 'is-online'}`;
  const summaryText = hasDown
    ? 'Un serveur est hors ligne'
    : hasWarn
      ? 'Un serveur démarre ou reste à configurer'
      : 'Tous les serveurs sont en ligne';
  summary.innerHTML = `<span class="status-summary-dot"></span><strong class="status-summary-percent">${globalPercent.toFixed(2)}%</strong><span>${summaryText}</span>`;

  root.innerHTML = services.map((service) => {
    const percent = Math.max(0, Math.min(100, Number(service.uptime_percent || 0)));
    const stateClass = stateLabelClass(service.state);
    const name = Trizone.escapeHtml(service.name || 'Service');
    const desc = Trizone.escapeHtml(service.description || '');
    const meta = Trizone.escapeHtml(service.meta || '');
    const stateLabel = Trizone.escapeHtml(service.state_label || 'Indisponible');

    return `
      <article class="uptime-row">
        <div class="uptime-service">
          <div class="uptime-service-top">
            <span class="uptime-percent ${stateClass}">${percent.toFixed(2)}%</span>
            <div class="uptime-service-name">
              <strong>${name}</strong>
              <span>${desc}</span>
            </div>
          </div>
          <div class="uptime-service-meta">
            <span class="service-live-state ${stateClass}"><i></i>${stateLabel}</span>
            ${meta ? `<span>${meta}</span>` : ''}
          </div>
        </div>

        <div class="uptime-history-wrap">
          <div class="uptime-history">${renderHistory(service.history)}</div>
          <div class="uptime-history-labels">
            <span>20 min</span>
            <span>Maintenant</span>
          </div>
        </div>
      </article>`;
  }).join('');
}

async function loadStatusBoard() {
  try {
    const data = await Trizone.json('/api/status-board');
    renderStatusBoard(data);
  } catch (error) {
    const root = document.getElementById('status-board');
    const summary = document.getElementById('status-summary');
    if (root) root.innerHTML = '<div class="uptime-loading">Impossible de récupérer l’état des services.</div>';
    if (summary) {
      summary.className = 'status-summary is-offline';
      summary.innerHTML = '<span class="status-summary-dot"></span><span>Statut indisponible</span>';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  trizoneHeader('home');
  trizoneFooter();
  await Trizone.boot();
  await loadStatusBoard();
  setInterval(loadStatusBoard, 20_000);
});
