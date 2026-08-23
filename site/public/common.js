const Trizone = (() => {
  const state = { me: { authenticated: false }, config: {} };

  const escapeHtml = (text = '') => String(text)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const stripHtml = (html = '') => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').trim();
  };

  async function json(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
    return data;
  }

  function rankClass(rank = '') {
    const key = String(rank).toLowerCase().replace(/[^a-z0-9]/g, '');
    const known = ['default', 'copper', 'iron', 'gold', 'diamond', 'netherite', 'vip', 'owner', 'admin', 'mod', 'helper'];
    return known.includes(key) ? `rank-${key}` : 'rank-default';
  }

  function rankLabel(rank = '') {
    const value = String(rank || 'default').trim();
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Default';
  }

  function setAuthVisibility(me) {
    document.querySelectorAll('[data-auth="guest"]').forEach((el) => { el.hidden = !!me.authenticated; });
    document.querySelectorAll('[data-auth="user"]').forEach((el) => { el.hidden = !me.authenticated; });
    document.querySelectorAll('[data-auth="admin"]').forEach((el) => { el.hidden = !me.authenticated || !me.admin; });

    document.querySelectorAll('[data-account-label]').forEach((el) => {
      if (!me.authenticated) return;
      const name = me.user.discord_global_name || me.user.discord_username || 'Compte';
      const rank = me.user.minecraft_rank && me.user.minecraft_username ? ` · ${rankLabel(me.user.minecraft_rank)}` : '';
      el.textContent = `${name}${rank}`;
    });
  }

  async function loadMe() {
    try { state.me = await json('/api/me'); }
    catch { state.me = { authenticated: false }; }
    setAuthVisibility(state.me);
    return state.me;
  }

  async function loadSiteConfig() {
    try { state.config = await json('/api/site-config'); }
    catch { state.config = {}; }
    applySiteConfig(state.config);
    return state.config;
  }

  function applySiteConfig(config = {}) {
    document.querySelectorAll('[data-site-text]').forEach((el) => {
      const key = el.dataset.siteText;
      if (config[key] != null && config[key] !== '') el.textContent = config[key];
    });
    document.querySelectorAll('[data-site-href]').forEach((el) => {
      const key = el.dataset.siteHref;
      const value = config[key];
      if (value) { el.href = value; el.hidden = false; }
      else { el.hidden = true; }
    });
    document.querySelectorAll('[data-server-address]').forEach((el) => {
      const value = config.server_address || 'play.trizone.club';
      if (el.matches('[data-copy]')) el.dataset.copy = value;
      if (el.matches('code,span,strong')) el.textContent = value;
    });
    const announcement = document.querySelector('[data-announcement]');
    if (announcement) {
      const value = String(config.announcement || '').trim();
      announcement.textContent = value;
      announcement.hidden = !value;
    }
  }

  function setupMobileNav() {
    const toggle = document.querySelector('[data-mobile-toggle]');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => links.classList.remove('open')));
  }


  const MINECRAFT_ASSET_VERSION = '1.21.11';

  function normalizeMinecraftMaterial(material) {
    return String(material || 'IRON_SWORD')
      .trim()
      .toLowerCase()
      .replace(/^minecraft:/, '')
      .replace(/[^a-z0-9_]/g, '') || 'iron_sword';
  }

  function minecraftIconHtml(material, _legacyFallback = '', extraClass = '') {
    const key = normalizeMinecraftMaterial(material);
    const safeClass = String(extraClass || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const itemSrc = `https://assets.mcasset.cloud/${MINECRAFT_ASSET_VERSION}/assets/minecraft/textures/item/${key}.png`;
    const blockSrc = `https://assets.mcasset.cloud/${MINECRAFT_ASSET_VERSION}/assets/minecraft/textures/block/${key}.png`;
    const fallbackSrc = `https://assets.mcasset.cloud/${MINECRAFT_ASSET_VERSION}/assets/minecraft/textures/item/barrier.png`;
    return `<span class="mc-item-icon${safeClass ? ` ${safeClass}` : ''}"><img src="${itemSrc}" data-mc-item-icon data-mc-block-src="${blockSrc}" data-mc-fallback-src="${fallbackSrc}" alt="" loading="lazy" decoding="async"></span>`;
  }

  function bindMinecraftIcons(root = document) {
    // v3.2.2: retire aussi les anciens glyphes emoji encore presents dans du HTML mis en cache.
    root.querySelectorAll('.mc-item-fallback').forEach((fallback) => fallback.remove());
    root.querySelectorAll('img[data-mc-item-icon]:not([data-mc-bound])').forEach((img) => {
      img.dataset.mcBound = '1';
      img.addEventListener('error', () => {
        if (img.dataset.mcTriedBlock !== '1' && img.dataset.mcBlockSrc) {
          img.dataset.mcTriedBlock = '1';
          img.src = img.dataset.mcBlockSrc;
          return;
        }
        if (img.dataset.mcTriedFallback !== '1' && img.dataset.mcFallbackSrc) {
          img.dataset.mcTriedFallback = '1';
          img.src = img.dataset.mcFallbackSrc;
          return;
        }
        img.hidden = true;
      });
    });
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const temp = document.createElement('textarea');
    temp.value = value; temp.className = 'clipboard-proxy';
    document.body.appendChild(temp); temp.select(); document.execCommand('copy'); temp.remove();
  }

  function setupCopyButtons() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      try {
        await copyText(button.dataset.copy || '');
        const old = button.textContent;
        button.textContent = 'Copié';
        showToast('Adresse copiée.');
        setTimeout(() => { button.textContent = old; }, 1200);
      } catch { showToast('Impossible de copier automatiquement.', 'bad'); }
    });
  }

  function setupLogout() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-logout]');
      if (!button) return;
      button.disabled = true;
      await json('/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
      location.href = '/';
    });
  }

  function showToast(message, type = '') {
    let toast = document.getElementById('site-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'site-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2600);
  }

  async function boot() {
    setupMobileNav();
    setupCopyButtons();
    setupLogout();
    const [me, config] = await Promise.all([loadMe(), loadSiteConfig()]);
    return { me, config };
  }

  return { state, json, escapeHtml, stripHtml, rankClass, rankLabel, loadMe, loadSiteConfig, applySiteConfig, showToast, boot, minecraftIconHtml, bindMinecraftIcons, normalizeMinecraftMaterial };
})();
