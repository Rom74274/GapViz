// Star Gap content script — injecté sur app.ahrefs.com/*
// Étape 1 (ce commit) : juste détecter qu'on est sur Ahrefs Organic Keywords
// et logger. L'injection du banner + l'interception du download arrivent
// dans les commits suivants.

(function () {
  'use strict';

  // Évite la double injection si l'extension reload.
  if (window.__starGapExtensionLoaded) return;
  window.__starGapExtensionLoaded = true;

  console.log('[Star Gap] Extension chargée sur', window.location.href);

  // Détecte si on est sur la page Organic Keywords.
  function isOrganicKeywordsPage() {
    return /^\/site-explorer\/organic-keywords/.test(window.location.pathname);
  }

  // Re-check à chaque changement de route SPA (Ahrefs est une SPA React).
  let lastPath = '';
  function onRouteChange() {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    if (isOrganicKeywordsPage()) {
      console.log('[Star Gap] Détection : page Organic Keywords active');
      // TODO commit 2 : injecter le banner ici
    }
  }

  // Polling toutes les 500ms — plus simple que de hooker history.pushState
  // qui n'est pas toujours fiable avec les SPAs.
  setInterval(onRouteChange, 500);
  onRouteChange();

  // Expose un flag global pour que l'app Star Gap puisse détecter si
  // l'extension est installée (window.starGapExtension).
  // Note : ne marche pas cross-origin par défaut. On utilisera postMessage
  // depuis app.starGap.io plus tard. Pour l'instant on log juste.
})();
