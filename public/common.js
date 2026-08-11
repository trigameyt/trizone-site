const Trizone = (() => {
  const state = { me: null };

  const escapeHtml = (text = '') => String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const stripHtml = (html = '') => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').trim();
  };

  async function json(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
    return data;
  }

  function setupMobileNav() {
    const toggle = document.querySelector('[data-mobile-toggle]');
    const links = document.querySelector('.nav-links');
    toggle?.addEventListener('click', () => links?.classList.toggle('open'));
  }

  async function loadMe() {
    try {
      state.me = await json('/api/me');
    } catch {
      state.me = { authenticated: false };
    }

    const login = document.querySelector('[data-login]');
    const account = document.querySelector('[data-account]');
    const admin = document.querySelector('[data-admin-link]');

    if (state.me.authenticated) {
      if (login) login.hidden = true;
      if (account) {
        account.hidden = false;
        const name = state.me.user.discord_global_name || state.me.user.discord_username;
        account.textContent = name;
      }
      if (admin) admin.hidden = !state.me.admin;
    } else {
      if (login) login.hidden = false;
      if (account) account.hidden = true;
      if (admin) admin.hidden = true;
    }
    return state.me;
  }

  async function loadAnnouncement() {
    const box = document.querySelector('[data-announcement]');
    if (!box) return;
    try {
      const data = await json('/api/announcement');
      if (data.value) {
        box.textContent = data.value;
        box.classList.add('show');
      }
    } catch {}
  }

  function setupCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const value = button.getAttribute('data-copy');
        await navigator.clipboard.writeText(value);
        const old = button.textContent;
        button.textContent = 'Copié ✓';
        setTimeout(() => button.textContent = old, 1400);
      });
    });
  }

  function setupLogout() {
    document.querySelectorAll('[data-logout]').forEach((button) => {
      button.addEventListener('click', async () => {
        try { await json('/auth/logout', { method: 'POST', body: '{}' }); } catch {}
        location.href = '/';
      });
    });
  }

  function boot() {
    setupMobileNav();
    setupCopyButtons();
    setupLogout();
    loadMe();
    loadAnnouncement();
  }

  return { state, json, escapeHtml, stripHtml, loadMe, boot };
})();

