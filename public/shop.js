let shopCategories = [];
let currentCategory = 'all';
let currentUser = { authenticated: false };

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
      const notice = document.getElementById('shop-notice');
      notice.className = 'notice bad';
      notice.innerHTML = 'Lie d’abord ton compte Minecraft depuis <a href="/account.html">Mon compte</a>.';
      return;
    }

    const data = await Trizone.json('/api/shop/checkout', {
      method: 'POST',
      body: JSON.stringify({ rank }),
    });
    if (!data.url) throw new Error('Lien de paiement Stripe absent.');
    location.href = data.url;
  } catch (error) {
    const notice = document.getElementById('shop-notice');
    notice.className = 'notice bad';
    notice.textContent = error.message;
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
  const notice = document.getElementById('shop-notice');
  const params = new URLSearchParams(location.search);

  if (params.get('payment') === 'cancel') {
    notice.className = 'notice bad';
    notice.textContent = 'Paiement annulé. Aucun grade n’a été livré.';
  }

  try {
    const payload = await Trizone.json('/api/shop/categories');
    shopCategories = payload.data || [];
    notice.className = 'notice good';
    notice.textContent = currentUser.authenticated && currentUser.user?.minecraft_username
      ? `Achat pour ${currentUser.user.minecraft_username}. Le paiement international et les taxes sont traités par Stripe Managed Payments / Link.`
      : 'Connecte ton Discord et lie ton compte Minecraft avant d’acheter. Le checkout est traité par Stripe Managed Payments / Link.';
    renderTabs();
    renderProducts();
  } catch (error) {
    notice.className = 'notice bad';
    notice.textContent = error.message;
    document.getElementById('products').innerHTML = '<div class="panel"><h3>Boutique pas encore prête</h3><p class="muted">Ajoute la clé Stripe et les Price IDs dans Render avant d’afficher les produits.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', loadShop);
