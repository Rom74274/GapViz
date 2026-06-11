// Star Gap content script — injecté sur app.ahrefs.com/*
// Étape 2 : injection du banner d'instructions quand on est sur la page
// Organic Keywords. Le banner restera affiché tant que l'user n'a pas
// cliqué Export ou fermé manuellement.

(function () {
  'use strict';

  if (window.__starGapExtensionLoaded) return;
  window.__starGapExtensionLoaded = true;

  console.log('[Star Gap] Extension chargée sur', window.location.href);

  // ID du banner pour le retrouver et éviter doublons.
  const BANNER_ID = 'sg-banner-root';

  function isOrganicKeywordsPage() {
    return /^\/site-explorer\/organic-keywords/.test(window.location.pathname);
  }

  // Indique à l'user qu'il doit cliquer Export. Le banner suit la session
  // (réapparaît si fermé puis on revient sur la page).
  function injectBanner() {
    if (document.getElementById(BANNER_ID)) return; // déjà injecté

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'sg-banner';
    banner.innerHTML = `
      <div class="sg-banner-content">
        <div class="sg-banner-logo">
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="#fff"/>
            <circle cx="8" cy="8" r="6" fill="#fff" fill-opacity="0.3"/>
            <circle cx="20" cy="18" r="2.5" fill="#fff"/>
            <circle cx="20" cy="18" r="5" fill="#fff" fill-opacity="0.25"/>
            <line x1="10.5" y1="9.5" x2="17.5" y2="16.5" stroke="#fff" stroke-width="1" opacity="0.5"/>
          </svg>
        </div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">Star Gap Importer</div>
          <div class="sg-banner-message">
            Clique sur <strong>Export → CSV</strong> au-dessus de la table pour envoyer tes mots-clés.
          </div>
        </div>
        <div class="sg-banner-arrow">↓</div>
        <button class="sg-banner-close" aria-label="Fermer">×</button>
      </div>
    `;
    document.body.appendChild(banner);

    banner.querySelector('.sg-banner-close')?.addEventListener('click', () => {
      banner.classList.add('sg-banner-closing');
      setTimeout(() => banner.remove(), 250);
    });

    console.log('[Star Gap] Banner injecté');
  }

  function removeBanner() {
    const b = document.getElementById(BANNER_ID);
    if (b) b.remove();
  }

  // Polling 500ms pour suivre les changements de route SPA.
  let lastPath = '';
  function onRouteChange() {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    if (isOrganicKeywordsPage()) {
      console.log('[Star Gap] Détection : page Organic Keywords active');
      // Petit délai pour laisser Ahrefs rendre sa table avant qu'on injecte.
      setTimeout(injectBanner, 800);
    } else {
      removeBanner();
    }
  }

  setInterval(onRouteChange, 500);
  onRouteChange();
})();
