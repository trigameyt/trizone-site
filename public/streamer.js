(() => {
  function esc(value) {
    if (window.Trizone?.escapeHtml) return Trizone.escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function request(url, options = {}) {
    if (window.Trizone?.json) return Trizone.json(url, options);
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function liveBadge(live) {
    return live
      ? '<span class="streamer-live-badge">● EN LIVE</span>'
      : '<span class="streamer-offline-badge">Hors ligne</span>';
  }

  async function render() {
    const root = document.getElementById('twitch-link-root');
    if (!root) return;
    root.innerHTML = '<div class="skeleton"></div>';

    try {
      const data = await request('/api/account/twitch');
      if (!data.linked) {
        root.innerHTML = `
          <div class="streamer-card">
            <div>
              <span class="streamer-kicker">CRÉATEUR TRIZONE</span>
              <h3>Lier mon compte Twitch</h3>
              <p>Lie Twitch à ton compte Trizone. Le rôle <b>Streamer</b> sera synchronisé sur Discord et Minecraft.</p>
              <p class="muted">Quand tu es en live et connecté sur Trizone, le serveur peut annoncer ton live automatiquement.</p>
            </div>
            <a class="btn btn-primary" href="/auth/twitch">Lier Twitch</a>
          </div>`;
        return;
      }

      const t = data.twitch;
      const stream = t.stream || {};
      const twitchUrl = `https://www.twitch.tv/${encodeURIComponent(t.login)}`;
      root.innerHTML = `
        <div class="streamer-card streamer-linked ${t.live ? 'is-live' : ''}">
          <div class="streamer-profile">
            ${t.profile_image_url ? `<img src="${esc(t.profile_image_url)}" alt="Twitch ${esc(t.display_name)}">` : ''}
            <div>
              <span class="streamer-kicker">TWITCH LIÉ</span>
              <h3>${esc(t.display_name)}</h3>
              <div class="streamer-meta">${liveBadge(t.live)} <span>twitch.tv/${esc(t.login)}</span></div>
            </div>
          </div>
          ${t.live && stream.thumbnail_url ? `
            <a class="streamer-preview" href="${esc(twitchUrl)}" target="_blank" rel="noopener noreferrer">
              <img src="${esc(stream.thumbnail_url)}?trizone=${Date.now()}" alt="Aperçu du live">
              <div><b>${esc(stream.title || 'Live Twitch')}</b>${stream.game_name ? `<span>${esc(stream.game_name)}</span>` : ''}</div>
            </a>` : ''}
          <div class="streamer-actions">
            <a class="btn btn-quiet" href="${esc(twitchUrl)}" target="_blank" rel="noopener noreferrer">Voir Twitch</a>
            <button class="btn btn-quiet" id="unlink-twitch" type="button">Délier Twitch</button>
          </div>
        </div>`;

      document.getElementById('unlink-twitch')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!confirm('Délier ton compte Twitch de Trizone ?')) return;
        button.disabled = true;
        try {
          await request('/api/account/twitch/unlink', { method: 'POST', body: '{}' });
          await render();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
        }
      });
    } catch (error) {
      root.innerHTML = `<div class="notice bad">${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', render);
})();