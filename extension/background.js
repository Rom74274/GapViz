// Star Gap background service worker.
// Étape 3 : interception des téléchargements CSV venant d'Ahrefs.
// Workflow :
//   1. User clique Export sur Ahrefs → CSV se télécharge
//   2. chrome.downloads.onCreated trigger → on filtre les downloads
//      ahrefs.com avec extension .csv
//   3. On stocke l'ID + URL du download
//   4. chrome.downloads.onChanged trigger → quand le download passe en
//      state="complete", on lit le fichier via fetch (l'URL pointe vers
//      le fichier local — file://, mais Chrome refuse fetch file://...)
//   5. Plan B : on intercepte la requête réseau d'Ahrefs vers leur API
//      d'export AVANT que le navigateur télécharge. Plus complexe mais
//      seul moyen fiable de récupérer le contenu sans permission
//      file system.
//
// V1 minimal : on log juste les metadata du download (URL source,
// filename, state) pour vérifier qu'on intercepte bien. La lecture
// du contenu CSV viendra avec une approche fetch sur l'URL d'origine.

const AHREFS_DOMAIN = 'ahrefs.com';

// Map downloadId → metadata.
const trackedDownloads = new Map();

chrome.downloads.onCreated.addListener((downloadItem) => {
  const url = downloadItem.url || '';
  const finalUrl = downloadItem.finalUrl || url;
  const filename = downloadItem.filename || '';

  // Filtre : on veut uniquement les downloads venant d'Ahrefs avec un CSV.
  const isFromAhrefs =
    url.includes(AHREFS_DOMAIN) ||
    finalUrl.includes(AHREFS_DOMAIN) ||
    (downloadItem.referrer || '').includes(AHREFS_DOMAIN);

  const looksLikeCsv =
    /\.csv($|\?)/i.test(url) ||
    /\.csv($|\?)/i.test(finalUrl) ||
    /\.csv$/i.test(filename) ||
    downloadItem.mime === 'text/csv';

  if (!isFromAhrefs || !looksLikeCsv) return;

  console.log('[Star Gap] Download Ahrefs CSV détecté', {
    id: downloadItem.id,
    url: url.slice(0, 100),
    finalUrl: finalUrl.slice(0, 100),
    referrer: downloadItem.referrer,
    filename,
    mime: downloadItem.mime,
    state: downloadItem.state,
  });

  trackedDownloads.set(downloadItem.id, {
    sourceUrl: url,
    finalUrl,
    filename,
    referrer: downloadItem.referrer,
    startedAt: Date.now(),
  });
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!trackedDownloads.has(delta.id)) return;

  // Suivi de l'état (in_progress → complete OU interrupted).
  if (delta.state) {
    const meta = trackedDownloads.get(delta.id);
    console.log(`[Star Gap] Download ${delta.id} → ${delta.state.current}`, {
      ...meta,
      newState: delta.state.current,
    });

    if (delta.state.current === 'complete') {
      // Récupère le filename final (parfois set après onCreated).
      chrome.downloads.search({ id: delta.id }, (results) => {
        if (results && results[0]) {
          const fullPath = results[0].filename;
          console.log('[Star Gap] CSV téléchargé :', fullPath);
          console.log('[Star Gap] → prochaine étape (commit 4) : envoi vers Star Gap');
          // TODO commit 4 : lire le contenu du CSV et l'envoyer à
          // l'Edge Function extension-import.
        }
      });
      trackedDownloads.delete(delta.id);
    } else if (delta.state.current === 'interrupted') {
      console.warn('[Star Gap] Download interrompu', delta.id);
      trackedDownloads.delete(delta.id);
    }
  }
});

// Listener message du content script (toujours utile pour commit 5+).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  return false;
});

console.log('[Star Gap] Background service worker prêt — écoute des downloads Ahrefs CSV');
