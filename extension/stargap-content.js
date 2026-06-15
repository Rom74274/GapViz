// ---------------------------------------------------------------------------
// Content-script injecté sur les pages Star Gap.
// Pose un data-attribute sur <html> que l'app React lit pour détecter que
// l'extension est installée et active.
// ---------------------------------------------------------------------------

(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const ATTR = 'data-stargap-extension';

  const mark = () => {
    if (document.documentElement) {
      document.documentElement.setAttribute(ATTR, VERSION);
    }
  };

  mark();
  // run_at=document_start → <html> peut ne pas être complet : on re-pose au
  // DOMContentLoaded au cas où une lib réinitialise le root element.
  document.addEventListener('DOMContentLoaded', mark, { once: true });

  // Réponse à un ping côté app (fallback si le data-attribute est lavé par
  // un framework qui réécrit <html>).
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.type === 'stargap:ping') {
      window.postMessage({ type: 'stargap:pong', version: VERSION }, '*');
    }
  });
})();
