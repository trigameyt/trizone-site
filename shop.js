let shopCategories = [];
let currentCategory = 'all';
let currentUser = { authenticated: false };

function clearShopMessage() {
  const box = document.getElementById('shop-message');
  if (!box) return;
  box.hidden = true;
  box.textContent = '';
}

function showShopError(message, html = false) {
  const box = document.getElementById('shop-message');
  if (!box) return;
  box.hidden = false;
  box.className = 'shop-inline-error';
  if (html) box.innerHTML = message;
  else box.textContent = message;
}

function moneyFromMinor(value, currency) {
  const code = String(currency || 'CHF').toUpperCase();
  const minor = Number(value || 0);
  try {
    return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: code }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

function renderTabs() {
  const root = document.getElementById('shop-tabs');
  root.innerHTML = '';
  const items = [{ id: 'all', name: 'Tout' }, ...shopCategories.map((c) => ({ id: String(c.id), name: c.name }))];
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shop-tab ${String(currentCategory) === String(item.id) ? 'active' : ''}`;
    button.textContent = item.name;
    button.addEventListener('click', () => {
      currentCategory = item.id;
      renderTabs();
      renderProducts();
    });
    root.appendChild(button);
  });
}

function renderProducts() {
  const root = document.getElementById('products');
  root.innerHTML = '';
  const categories = currentCategory === 'all'
    ? shopCategories
    : shopCategories.filter((c) => String(c.id) === String(currentCategory));
  const products = categories.flatMap((c) => (c.packages || []).map((p) => ({ ...p, categoryName: c.name })));

  if (!products.length) {
    root.innerHTML = '<div class="panel"><h3>Aucun produit</h3><p class="muted">Configure les cinq produits/Price IDs dans Stripe puis recharge cette page.</p></div>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    const image = product.image
      ? `<img src="${Trizone.escapeHtml(product.image)}" alt="${Trizone.escapeHtml(product.name || 'Produit')}">`
      : '<div class="product-fallback">TRIZONE</div>';
    const description = Trizone.stripHtml(product.description || `Grade ${product.name}`).slice(0, 260);
    card.innerHTML = `
      <div class="product-image">${image}</div>
      <div class="product-body">
        <small>${Trizone.escapeHtml(product.categoryName || '')}</small>
        <h3>${Trizone.escapeHtml(product.name || 'Produit')}</h3>
        <p>${Trizone.escapeHtml(description)}</p>
        <div class="product-bottom">
          <strong>${Trizone.escapeHtml(moneyFromMinor(product.unit_amount, product.currency))}</strong>
          <button type="button" class="btn btn-primary btn-small" data-rank="${Trizone.escapeHtml(product.rank)}">Acheter</button>
        </div>
      </div>`;
    root.appendChild(card);
  });

  root.querySelectorAll('[data-rank]').forEach((button) => {
    button.addEventListener('click', () => checkout(button.dataset.rank, button));
  });
}

async function checkout(rank, button) {
  button.disabled = true;
  const old = button.textContent;
  button.textContent = 'Ouverture…';
  try {
    if (!currentUser.authenticated) {
      location.href = '/auth/discord';
      return;
    }
    if (!currentUser.user?.minecraft_username) {
      showShopError('Lie d’abord ton compte Minecraft depuis <a href="/account.html">Mon compte</a>.', true);
      return;
    }

    clearShopMessage();

    const data = await Trizone.json('/api/shop/checkout', {
      method: 'POST',
      body: JSON.stringify({ rank }),
    });
    if (!data.url) throw new Error('Lien de paiement Stripe absent.');
    location.href = data.url;
  } catch (error) {
    showShopError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function loadShop() {
  trizoneHeader('shop');
  trizoneFooter();
  const boot = await Trizone.boot();
  currentUser = boot.me;
  clearShopMessage();

  // Les retours Stripe n'affichent plus de bandeau permanent.
  // On nettoie simplement les paramètres de paiement de l'URL.
  const params = new URLSearchParams(location.search);
  if (params.has('payment') || params.has('session_id')) {
    history.replaceState({}, '', location.pathname);
  }

  try {
    const payload = await Trizone.json('/api/shop/categories');
    shopCategories = payload.data || [];
    renderTabs();
    renderProducts();
  } catch (error) {
    showShopError(error.message);
    document.getElementById('products').innerHTML = '<div class="panel"><h3>Boutique pas encore prête</h3><p class="muted">Ajoute la clé Stripe et les Price IDs dans Render avant d’afficher les produits.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', loadShop);
