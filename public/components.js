
function trizoneInstallGlobalTheme() {
  if (document.getElementById('trizone-global-theme')) return;

  const style = document.createElement('style');
  style.id = 'trizone-global-theme';
  style.textContent = `
    html,
    * {
      scrollbar-width: thin;
      scrollbar-color: #352741 #0f0d13;
    }

    *::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    *::-webkit-scrollbar-track {
      background: #0f0d13;
      border-radius: 999px;
    }

    *::-webkit-scrollbar-thumb {
      min-height: 34px;
      background: #352741;
      border: 2px solid #0f0d13;
      border-radius: 999px;
    }

    *::-webkit-scrollbar-thumb:hover {
      background: #4b355e;
    }

    *::-webkit-scrollbar-corner {
      background: #0f0d13;
    }
  `;

  document.head.appendChild(style);
}

function trizoneHeader(active = '') {
  trizoneInstallGlobalTheme();
  const root = document.getElementById('site-header');
  if (!root) return;
  root.innerHTML = `
    <header class="topbar">
      <div class="container nav">
        <a class="brand" href="/" aria-label="Accueil Trizone">
          <img src="/assets/trizone-logo-square.jpg" alt="" class="brand-mark">
          <span>TRIZONE</span>
        </a>
        <button class="menu-button" type="button" data-mobile-toggle aria-label="Ouvrir le menu" aria-expanded="false">Menu</button>
        <nav class="nav-links" aria-label="Navigation principale">
          <a class="${active === 'home' ? 'active' : ''}" href="/">Accueil</a>
          <a href="/#status">État</a>
          <a class="${active === 'shop' ? 'active' : ''}" href="/shop.html">Boutique</a>
          <a class="${active === 'leaderboard' ? 'active' : ''}" href="/leaderboard.html">Leaderboard</a>
          <a class="${active === 'tournaments' ? 'active' : ''}" href="/tournaments.html">Tournois</a>
          <a class="${active === 'account' ? 'active' : ''}" href="/account.html">Compte</a>
          <a class="${active === 'admin' ? 'active' : ''}" href="/admin.html" data-auth="admin" hidden>Admin</a>
        </nav>
        <div class="nav-actions">
          <a class="btn btn-quiet btn-small" href="/account.html" data-auth="user" hidden data-account-label>Mon compte</a>
          <a class="btn btn-primary btn-small" href="/auth/discord" data-auth="guest" hidden>Connexion Discord</a>
        </div>
      </div>
    </header>`;
}

function trizoneFooter(options = {}) {
  const root = document.getElementById('site-footer');
  if (!root) return;
  const showLegalIdentity = options?.showLegalIdentity === true;
  root.innerHTML = `
    <footer class="footer">
      <div class="container footer-grid">
        <div>
          <div class="footer-title">TRIZONE</div>
          <div class="muted" data-site-text="server_address">play.trizone.club</div>
          <p class="footer-note">Serveur Minecraft communautaire Java & Bedrock.</p>
        </div>
        <div class="footer-links">
          <a href="/legal.html#mentions">Mentions légales</a>
          <a href="/legal.html#privacy">Confidentialité</a>
          <a href="/legal.html#conditions">Conditions</a>
          <a href="/shop.html">Boutique</a>
        </div>
      </div>
      ${showLegalIdentity ? `
        <div class="container legal-footer-identity" id="mentions" aria-label="Mentions légales">
          <span><strong>Exploitant :</strong> <span id="footer-operator-name">À renseigner</span></span>
          <span><strong>Adresse :</strong> <span id="footer-operator-address">À renseigner</span></span>
          <span><strong>E-mail :</strong> <a id="footer-operator-email" href="#">À renseigner</a></span>
        </div>` : ''}
      <div class="container minecraft-disclaimer">Non officiel. Trizone n’est ni approuvé, ni associé à Mojang ou Microsoft.</div>
    </footer>`;
}
