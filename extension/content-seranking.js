// Star Gap content script — injecté sur *.seranking.com
// Détecte le token starGapToken en URL, le stocke côté background, et
// affiche un banner adapté à l'état d'import.

(function () {
  'use strict';

  if (window.__starGapExtensionLoaded) return;
  window.__starGapExtensionLoaded = true;

  console.log('[Star Gap] Extension SE Ranking chargée sur', window.location.href);

  const BANNER_ID = 'sg-banner-root';

  let importStatus = 'idle';
  let lastError = null;

  function isOrganicKeywordsPage() {
    return /research\.competitor\.html.*organic.*keywords/i.test(
      window.location.pathname + window.location.search,
    );
  }

  function captureTokenFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('starGapToken');
      if (!token) return;

      const target = params.get('domain') || '';
      const domain = target.replace(/^www\./, '').replace(/\/$/, '');

      chrome.runtime.sendMessage({
        type: 'sg_session_started',
        token,
        domain,
      });

      importStatus = 'active';
      console.log('[Star Gap] Token Star Gap détecté (SE Ranking)', { domain });

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('starGapToken');
      window.history.replaceState({}, '', cleanUrl.toString());
    } catch (e) {
      console.error('[Star Gap] Erreur lecture token URL SE Ranking', e);
    }
  }

  function renderBannerContent() {
    if (importStatus === 'active') {
      return `
        <div class="sg-banner-logo">${logoSvg()}</div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">Star Gap connecté</div>
          <div class="sg-banner-message">
            Clique sur <strong>Export → CSV</strong> au-dessus de la table.
            Star Gap récupère tout automatiquement.
          </div>
        </div>
        <div class="sg-banner-arrow">↓</div>
        <button class="sg-banner-close" aria-label="Fermer">×</button>
      `;
    }
    if (importStatus === 'uploading') {
      return `
        <div class="sg-banner-logo">${logoSvg()}</div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">Envoi vers Star Gap…</div>
          <div class="sg-banner-message">Patiente quelques secondes.</div>
        </div>
      `;
    }
    if (importStatus === 'success') {
      return `
        <div class="sg-banner-logo">${logoSvg()}</div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">✓ Import terminé</div>
          <div class="sg-banner-message">
            Tes mots-clés sont dans Star Gap. Tu peux fermer cet onglet.
          </div>
        </div>
        <button class="sg-banner-close" aria-label="Fermer">×</button>
      `;
    }
    if (importStatus === 'failed') {
      return `
        <div class="sg-banner-logo">${logoSvg()}</div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">Échec de l'import</div>
          <div class="sg-banner-message">${escapeHtml(lastError || 'Erreur inconnue')}</div>
        </div>
        <button class="sg-banner-close" aria-label="Fermer">×</button>
      `;
    }
    return `
      <div class="sg-banner-logo">${logoSvg()}</div>
      <div class="sg-banner-text">
        <div class="sg-banner-title">Star Gap Importer</div>
        <div class="sg-banner-message">
          Démarre l'import depuis Star Gap pour envoyer tes mots-clés en 1 clic.
        </div>
      </div>
      <button class="sg-banner-close" aria-label="Fermer">×</button>
    `;
  }

  function logoSvg() {
    return `
      <svg viewBox="0 0 28 28" width="22" height="22" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="#fff"/>
        <circle cx="8" cy="8" r="6" fill="#fff" fill-opacity="0.3"/>
        <circle cx="20" cy="18" r="2.5" fill="#fff"/>
        <circle cx="20" cy="18" r="5" fill="#fff" fill-opacity="0.25"/>
        <line x1="10.5" y1="9.5" x2="17.5" y2="16.5" stroke="#fff" stroke-width="1" opacity="0.5"/>
      </svg>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectOrUpdateBanner() {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      document.body.appendChild(banner);
    }
    banner.innerHTML = `<div class="sg-banner-content">${renderBannerContent()}</div>`;
    const closeBtn = banner.querySelector('.sg-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.classList.add('sg-banner-closing');
        setTimeout(() => banner.remove(), 250);
      });
    }
  }

  function removeBanner() {
    const b = document.getElementById(BANNER_ID);
    if (b) b.remove();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'sg_import_status') {
      importStatus = msg.status;
      lastError = msg.error || null;
      console.log('[Star Gap] Status import →', importStatus, msg);
      if (document.getElementById(BANNER_ID)) {
        injectOrUpdateBanner();
      }
    }
  });

  let lastPath = '';
  function onRouteChange() {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    if (isOrganicKeywordsPage()) {
      console.log('[Star Gap] Détection : page SE Ranking Organic Keywords');
      setTimeout(injectOrUpdateBanner, 800);
    } else {
      removeBanner();
    }
  }

  captureTokenFromUrl();
  setInterval(onRouteChange, 500);
  onRouteChange();
})();
