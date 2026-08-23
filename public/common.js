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
  const MINECRAFT_SPECIAL_ICON_SOURCES = Object.freeze({
    // v3.3.12: bouclier local avec marge transparente pour ne jamais couper le rendu.
    // Embarque directement => aucune requete HTTP et aucun 404.
    shield: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%22-4%20-4%2040%2040%22%20shape-rendering%3D%22crispEdges%22%3E%0A%20%20%3C%21--%20Minecraft-like%20GUI%20shield%3A%20slightly%20rotated%203D%20face%20--%3E%0A%20%20%3C%21--%20rear%20thickness%20--%3E%0A%20%20%3Cpath%20d%3D%22M7%207h2v17H7z%22%20fill%3D%22%234a4a4a%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M9%2024h2v2H9z%22%20fill%3D%22%233b3b3b%22%2F%3E%0A%0A%20%20%3C%21--%20outer%20metal%20rim%20--%3E%0A%20%20%3Cpath%20d%3D%22M9%204h12v2h3v3h2v11h-2v4h-3v3h-3v2h-5v-2h-3v-3H8V8h1z%22%20fill%3D%22%237b7b7b%22%2F%3E%0A%20%20%3C%21--%20metal%20highlights%20%2F%20shadows%20--%3E%0A%20%20%3Cpath%20d%3D%22M10%204h11v2H10zM9%206h2v17H9zM11%2024h2v2h-2z%22%20fill%3D%22%23b7b7b7%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M22%207h2v2h-2zM24%209h2v11h-2zM22%2020h2v4h-2zM19%2024h3v3h-3zM14%2027h5v2h-5z%22%20fill%3D%22%23565656%22%2F%3E%0A%0A%20%20%3C%21--%20wooden%20face%20--%3E%0A%20%20%3Cpath%20d%3D%22M11%207h11v2h2v10h-2v4h-3v3h-6v-2h-2z%22%20fill%3D%22%238a5524%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M11%207h3v17h-3z%22%20fill%3D%22%23a96b2d%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M14%207h3v19h-3z%22%20fill%3D%22%237e491d%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M17%207h3v18h-3z%22%20fill%3D%22%239c5c23%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M20%209h2v14h-2z%22%20fill%3D%22%23744019%22%2F%3E%0A%20%20%3C%21--%20plank%20highlights%20--%3E%0A%20%20%3Cpath%20d%3D%22M12%209h1v5h-1zM15%208h1v7h-1zM18%2010h1v6h-1zM21%2011h1v5h-1z%22%20fill%3D%22%23ba7631%22%2F%3E%0A%20%20%3C%21--%20rivets%20--%3E%0A%20%20%3Crect%20x%3D%2210%22%20y%3D%228%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23c3c3c3%22%2F%3E%0A%20%20%3Crect%20x%3D%2221%22%20y%3D%229%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%238d8d8d%22%2F%3E%0A%20%20%3Crect%20x%3D%2210%22%20y%3D%2218%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23a4a4a4%22%2F%3E%0A%20%20%3Crect%20x%3D%2220%22%20y%3D%2219%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23747474%22%2F%3E%0A%20%20%3C%21--%20subtle%20lower%20edge%20--%3E%0A%20%20%3Crect%20x%3D%2213%22%20y%3D%2225%22%20width%3D%226%22%20height%3D%221%22%20fill%3D%22%23654018%22%2F%3E%0A%3C%2Fsvg%3E%0A'
  });

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
    const specialSrc = MINECRAFT_SPECIAL_ICON_SOURCES[key];

    if (specialSrc) {
      return `<span class="mc-item-icon${safeClass ? ` ${safeClass}` : ''}"><img src="${specialSrc}" data-mc-special-icon="${key}" alt="" loading="lazy" decoding="async"></span>`;
    }

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
