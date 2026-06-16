// Star Gap background service worker.
// Étape 6 : capture le CSV téléchargé depuis Ahrefs, refetch l'URL avec
// les cookies de l'user pour récupérer le contenu, POST à l'Edge Function
// extension-import avec le token stocké.

const EXTENSION_IMPORT_URL =
  'https://kngkvaqovdnysmqrvxtj.functions.supabase.co/extension-import';

// Configuration des sources d'import supportées : on identifie une source
// par un fragment d'URL présent dans url / finalUrl / referrer du download.
const IMPORT_SOURCES = [
  { id: 'ahrefs', urlMatch: 'ahrefs.com' },
  { id: 'semrush', urlMatch: 'semrush.com' },
  { id: 'seranking', urlMatch: 'seranking.com' },
];

function detectSourceFromDownload(item) {
  const haystacks = [
    item.url || '',
    item.finalUrl || '',
    item.referrer || '',
  ].join(' ');
  for (const s of IMPORT_SOURCES) {
    if (haystacks.includes(s.urlMatch)) return s.id;
  }
  return null;
}

// Map downloadId → metadata (pour relier onChanged à onCreated).
const trackedDownloads = new Map();

chrome.downloads.onCreated.addListener((downloadItem) => {
  const url = downloadItem.url || '';
  const finalUrl = downloadItem.finalUrl || url;
  const filename = downloadItem.filename || '';
  const referrer = downloadItem.referrer || '';

  const source = detectSourceFromDownload(downloadItem);
  if (!source) return;

  const looksLikeCsv =
    /\.csv($|\?)/i.test(url) ||
    /\.csv($|\?)/i.test(finalUrl) ||
    /\.csv$/i.test(filename) ||
    downloadItem.mime === 'text/csv';

  if (!looksLikeCsv) return;

  console.log(`[Star Gap] Download ${source} CSV détecté`, {
    id: downloadItem.id,
    finalUrl: finalUrl.slice(0, 120),
    filename,
  });

  trackedDownloads.set(downloadItem.id, {
    source,
    sourceUrl: url,
    finalUrl,
    filename,
    referrer,
    startedAt: Date.now(),
  });
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!trackedDownloads.has(delta.id)) return;
  if (!delta.state) return;

  const newState = delta.state.current;
  const meta = trackedDownloads.get(delta.id);

  if (newState === 'complete') {
    console.log('[Star Gap] Download complete, refetch + POST', meta);
    await handleCompletedDownload(meta);
    trackedDownloads.delete(delta.id);
  } else if (newState === 'interrupted') {
    console.warn('[Star Gap] Download interrompu', delta.id);
    trackedDownloads.delete(delta.id);
  }
});

async function handleCompletedDownload(meta) {
  // 1) Lit le token actif depuis storage.
  const { activeImportToken } = await chrome.storage.local.get('activeImportToken');
  if (!activeImportToken) {
    console.log('[Star Gap] Pas de token actif, on ignore ce download');
    return;
  }

  // Vérifie que le token n'est pas trop vieux (10 min côté serveur).
  const age = Date.now() - (activeImportToken.startedAt || 0);
  if (age > 10 * 60 * 1000) {
    console.warn('[Star Gap] Token expiré (>10 min), on ignore');
    await chrome.storage.local.remove('activeImportToken');
    return;
  }

  // Notifie le content script que l'upload commence.
  await sendStatusToActiveTab('uploading');

  try {
    // 2) Refetch l'URL d'origine avec les cookies Ahrefs (host_permissions
    // permet d'envoyer les cookies de session automatiquement).
    const refetchUrl = meta.finalUrl || meta.sourceUrl;
    if (!refetchUrl) throw new Error('URL de download introuvable');

    const csvRes = await fetch(refetchUrl, {
      method: 'GET',
      credentials: 'include',
    });

    if (!csvRes.ok) {
      throw new Error(`Refetch ${meta.source} : HTTP ${csvRes.status} (URL one-shot ?)`);
    }

    const csvBlob = await csvRes.blob();
    if (csvBlob.size === 0) throw new Error(`CSV vide reçu de ${meta.source}`);

    console.log(`[Star Gap] CSV ${meta.source} récupéré : ${csvBlob.size} bytes`);

    // 3) POST à l'Edge Function avec FormData.
    const form = new FormData();
    form.append('token', activeImportToken.token);
    form.append('domain', activeImportToken.domain || '');
    form.append('source', meta.source);
    form.append('csv', csvBlob, meta.filename || `${meta.source}-export.csv`);

    const importRes = await fetch(EXTENSION_IMPORT_URL, {
      method: 'POST',
      body: form,
    });

    const result = await importRes.json().catch(() => ({}));
    if (!importRes.ok || !result.ok) {
      throw new Error(result.message || result.error || `HTTP ${importRes.status}`);
    }

    console.log('[Star Gap] Import OK', result);
    await sendStatusToActiveTab('success', { project_id: result.project_id });

    // Ferme automatiquement l'onglet Ahrefs 3s après le succès (laisse
    // le temps à l'user de voir le banner 'Import terminé').
    const tabIdToClose = activeImportToken.tabId;
    setTimeout(() => {
      if (tabIdToClose) {
        chrome.tabs.remove(tabIdToClose).catch((e) => {
          console.warn('[Star Gap] Fermeture onglet impossible', e);
        });
      }
    }, 3000);

    await chrome.storage.local.remove('activeImportToken');
  } catch (e) {
    console.error('[Star Gap] Échec import', e);
    const msg = e instanceof Error ? e.message : String(e);
    await sendStatusToActiveTab('failed', { error: msg });
    // On ne clear pas le token : permet à l'user de retry en cliquant
    // Export à nouveau. Il expirera côté serveur après 10 min.
  }
}

async function sendStatusToActiveTab(status, extra = {}) {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      url: ['*://app.ahrefs.com/*', '*://*.semrush.com/*', '*://*.seranking.com/*'],
    });
    for (const tab of tabs) {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'sg_import_status',
          status,
          ...extra,
        });
      }
    }
  } catch (e) {
    console.warn('[Star Gap] sendStatusToActiveTab fail', e);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  if (msg?.type === 'sg_session_started') {
    // Capture le tabId de l'onglet Ahrefs pour pouvoir le fermer après succès.
    const tabId = sender.tab?.id;
    chrome.storage.local.set({
      activeImportToken: {
        token: msg.token,
        domain: msg.domain,
        tabId,
        startedAt: Date.now(),
      },
    });
    console.log('[Star Gap] Session import enregistrée', { tabId, domain: msg.domain });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

console.log('[Star Gap] Background service worker prêt');
