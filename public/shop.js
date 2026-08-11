let shopCategories = [];
let currentCategory = 'all';

function money(value, currency) {
  try { return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: currency || 'CHF' }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency || ''}`; }
}

function renderTabs() {
  const root = document.getElementById('shop-tabs');
  root.innerHTML = '';
  const items = [{ id: 'all', name: 'Tout' }, ...shopCategories.map(c => ({ id: String(c.id), name: c.name }))];
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = `shop-tab ${String(currentCategory) === String(item.id) ? 'active' : ''}`;
    btn.textContent = item.name;
    btn.onclick = () => { currentCategory = item.id; renderTabs(); renderProducts(); };
    root.appendChild(btn);
  });
}

function renderProducts() {
  const root = document.getElementById('products');
  root.innerHTML = '';
  const categories = currentCategory === 'all' ? shopCategories : shopCategories.filter(c => String(c.id) === String(currentCategory));
  const packages = categories.flatMap(c => (c.packages || []).map(p => ({ ...p, categoryName: c.name })));

  if (!packages.length) {
    root.innerHTML = '<div class="card"><h3>Aucun produit</h3><p>Crée tes packages dans Tebex puis recharge cette page.</p></div>';
    return;
  }

  packages.forEach(product => {
    const card = document.createElement('article');
    card.className = 'card product';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-image';
    if (product.image) {
      const img = document.createElement('img');
      img.src = product.image; img.alt = product.name || 'Produit'; imageWrap.appendChild(img);
    } else {
      const fallback = document.createElement('div'); fallback.className = 'fallback'; fallback.textContent = 'TRIZONE'; imageWrap.appendChild(fallback);
    }

    const title = document.createElement('h3'); title.textContent = product.name || 'Produit';
    const desc = document.createElement('div'); desc.className = 'product-desc'; desc.textContent = Trizone.stripHtml(product.description || `Catégorie : ${product.categoryName}`);
    const bottom = document.createElement('div'); bottom.className = 'product-bottom';
    const price = document.createElement('div'); price.className = 'price'; price.textContent = money(product.total_price ?? product.base_price, product.currency);
    const buy = document.createElement('button'); buy.className = 'btn btn-primary btn-small'; buy.textContent = 'Acheter';
    buy.onclick = () => checkout(product.id, buy);
    bottom.append(price, buy);
    card.append(imageWrap, title, desc, bottom);
    root.appendChild(card);
  });
}

async function checkout(packageId, button) {
  button.disabled = true; button.textContent = 'Ouverture…';
  try {
    const me = await Trizone.loadMe();
    if (!me.authenticated) { location.href = '/auth/discord'; return; }
    const data = await Trizone.json('/api/shop/checkout', { method: 'POST', body: JSON.stringify({ packageId }) });
    if (!data.url) throw new Error('Lien de paiement absent.');
    location.href = data.url;
  } catch (error) {
    const notice = document.getElementById('shop-notice');
    notice.className = 'notice bad'; notice.textContent = error.message;
    button.disabled = false; button.textContent = 'Acheter';
  }
}

async function loadShop() {
  trizoneHeader('shop'); trizoneFooter(); Trizone.boot();
  const notice = document.getElementById('shop-notice');
  const params = new URLSearchParams(location.search);
  if (params.get('payment') === 'cancel') { notice.className = 'notice bad'; notice.textContent = 'Paiement annulé.'; }
  try {
    const payload = await Trizone.json('/api/shop/categories');
    shopCategories = payload.data || [];
    notice.className = 'notice good';
    notice.textContent = 'Paiement sécurisé par Tebex. Les avantages sont livrés par le plugin Tebex du serveur.';
    renderTabs(); renderProducts();
  } catch (error) {
    notice.className = 'notice bad'; notice.textContent = error.message;
    document.getElementById('products').innerHTML = '<div class="card"><h3>Tebex pas encore configuré</h3><p>Ajoute ton TEBEX_WEBSTORE_TOKEN dans les variables du serveur web.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', loadShop);
