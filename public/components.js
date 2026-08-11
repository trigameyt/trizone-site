function trizoneHeader(active = '') {
  const nav = document.getElementById('site-header');
  if (!nav) return;
  nav.innerHTML = `
    <div class="nav-shell">
      <div class="container nav">
        <a class="brand" href="/">
          <img class="brand-mark" src="/assets/trizone-logo-square.jpg" alt="Logo Trizone">
          <div class="brand-name">TRI<span>ZONE</span></div>
        </a>
        <nav class="nav-links">
          <a class="${active === 'home' ? 'active' : ''}" href="/">Accueil</a>
          <a class="${active === 'shop' ? 'active' : ''}" href="/shop.html">Boutique</a>
          <a class="${active === 'account' ? 'active' : ''}" href="/account.html">Compte</a>
          <a class="${active === 'admin' ? 'active' : ''}" href="/admin.html" data-admin-link hidden>Admin</a>
          <a href="/legal.html">Infos</a>
        </nav>
        <div class="nav-actions">
          <button class="btn btn-small btn-ghost mobile-toggle" data-mobile-toggle aria-label="Menu">☰</button>
          <a class="btn btn-small btn-ghost" href="/account.html" data-account hidden>Compte</a>
          <a class="btn btn-small btn-primary" href="/auth/discord" data-login>Connexion Discord</a>
        </div>
      </div>
    </div>`;
}

function trizoneFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  footer.innerHTML = `
    <footer>
      <div class="container footer-grid">
        <div>
          <div class="footer-brand">TRIZONE</div>
          <div>play.trizone.club</div>
          <div style="max-width:660px;margin-top:10px">CECI N’EST PAS UN SERVICE MINECRAFT OFFICIEL. CE SITE N’EST PAS APPROUVÉ PAR MOJANG OU MICROSOFT, NI ASSOCIÉ À EUX.</div>
        </div>
        <div class="footer-links">
          <a href="/legal.html">Confidentialité</a>
          <a href="/legal.html#conditions">Conditions</a>
          <a href="/shop.html">Boutique</a>
        </div>
      </div>
    </footer>`;
}
