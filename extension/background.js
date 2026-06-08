// Star Gap background service worker.
// Étape 1 (ce commit) : juste un stub pour que le service worker existe.
// L'interception des downloads arrive dans le commit 3.

self.addEventListener('install', () => {
  console.log('[Star Gap] Service worker installé');
});

self.addEventListener('activate', () => {
  console.log('[Star Gap] Service worker activé');
});

// Écoute les messages du content script (préparation pour le commit 3).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Star Gap] Message reçu :', msg, 'de', sender.tab?.url);
  sendResponse({ ok: true });
  return false;
});
