// Star Gap content script — injecté sur app.ahrefs.com/*
// Étape 6 : lit le token starGapToken de l'URL au load, le stocke dans
// chrome.storage.local pour que le background script puisse y accéder
// quand l'user clique Export. Update le banner selon l'état.

(function () {
  'use strict';

  if (window.__starGapExtensionLoaded) return;
  window.__starGapExtensionLoaded = true;

  console.log('[Star Gap] Extension chargée sur', window.location.href);

  const BANNER_ID = 'sg-banner-root';

  // État local du banner (mis à jour par messages du background).
  let importStatus = 'idle'; // idle | active | uploading | success | failed
  let lastError = null;

  function isOrganicKeywordsPage() {
    return /^\/site-explorer\/organic-keywords/.test(window.location.pathname);
  }

  // Lit le token depuis ?starGapToken=... dans l'URL. Si présent, le
  // stocke dans chrome.storage.local pour le background script.
  function captureTokenFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('starGapToken');
      if (!token) return;

      // Extrait le domaine depuis target= (Ahrefs URL).
      const target = params.get('target') || '';
      const domain = target.replace(/^www\./, '').replace(/\/$/, '');

      chrome.storage.local.set({
        activeImportToken: {
          token,
          domain,
          startedAt: Date.now(),
        },
      });
      importStatus = 'active';
      console.log('[Star Gap] Token Star Gap détecté, session active', { domain });

      // Nettoie l'URL pour ne pas garder le token en barre d'adresse.
      // Évite que l'user partage/copie l'URL avec le token.
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('starGapToken');
      window.history.replaceState({}, '', cleanUrl.toString());
    } catch (e) {
      console.error('[Star Gap] Erreur lecture token URL', e);
    }
  }

  // Banner avec contenu adapté à l'état d'import.
  function renderBannerContent() {
    if (importStatus === 'active') {
      return `
        <div class="sg-banner-logo">${logoSvg()}</div>
        <div class="sg-banner-text">
          <div class="sg-banner-title">Star Gap connecté</div>
          <div class="sg-banner-message">
            Clique sur <strong>Export → CSV</strong> au-dessus de la table.
            On envoie tout vers Star Gap automatiquement.
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
    // idle : invite générique (mode hors session)
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

  // Écoute les messages du background (status de l'import).
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

  // Polling 500ms pour suivre les changements de route SPA.
  let lastPath = '';
  function onRouteChange() {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    if (isOrganicKeywordsPage()) {
      console.log('[Star Gap] Détection : page Organic Keywords active');
      setTimeout(injectOrUpdateBanner, 800);
    } else {
      removeBanner();
    }
  }

  // Capture le token AVANT le polling de route (on doit savoir si on a
  // une session active dès l'arrivée sur la page).
  captureTokenFromUrl();

  setInterval(onRouteChange, 500);
  onRouteChange();
})();
