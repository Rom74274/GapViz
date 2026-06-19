// ---------------------------------------------------------------------------
// Détection de l'extension Chrome "Star Gap Importer".
//
// L'extension injecte un content-script sur les pages Star Gap qui pose
// l'attribut `data-stargap-extension="<version>"` sur <html>. On lit cet
// attribut + on écoute un ping/pong en fallback.
//
// EXTENSION_INSTALL_URL est aujourd'hui la page locale /install (instructions
// sideload). Le jour où on passe sur le Chrome Web Store, on swap cette
// constante par le lien Store et toute l'UI suit.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

// HashRouter → '#/install' pour ouvrir la page dans un nouvel onglet.
// À switcher le jour où l'extension passe sur le Chrome Web Store :
//   export const EXTENSION_INSTALL_URL = 'https://chrome.google.com/webstore/...';
export const EXTENSION_INSTALL_URL = '#/install';

// Version minimale attendue de l'extension. À bumper en même temps que le
// manifest.json quand on release une nouvelle version qui ajoute / corrige
// quelque chose côté communication app↔extension. Si l'extension détectée
// est < EXTENSION_EXPECTED_VERSION, on affiche un banner "mise à jour
// disponible". Tant qu'on est en sideload, l'user doit recharger
// manuellement ; sur le Chrome Web Store, Chrome update auto sous 24h.
export const EXTENSION_EXPECTED_VERSION = '1.0.0';

const ATTR = 'data-stargap-extension';

// Compare deux versions semver simples ("1.2.3"). Retourne :
//   < 0 si a < b
//   = 0 si a === b
//   > 0 si a > b
// Tolère les versions incomplètes (ex: "1.0" → "1.0.0").
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function detectExtensionSync(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute(ATTR);
}

export function useExtensionInstalled(): {
  installed: boolean;
  version: string | null;
  needsUpdate: boolean;
  expectedVersion: string;
} {
  const [version, setVersion] = useState<string | null>(() => detectExtensionSync());

  useEffect(() => {
    const refresh = () => setVersion(detectExtensionSync());

    // Le content-script tourne en run_at=document_start mais React monte
    // peut-être avant l'injection. Observer les mutations de <html> pour
    // capter l'attribut dès qu'il apparaît.
    const obs = new MutationObserver(refresh);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR],
    });

    // Ping/pong en fallback (au cas où le data-attribute serait lavé).
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return;
      const data = e.data as { type?: string; version?: string } | null;
      if (data?.type === 'stargap:pong' && typeof data.version === 'string') {
        setVersion(data.version);
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'stargap:ping' }, '*');

    refresh();
    return () => {
      obs.disconnect();
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const installed = version !== null;
  const needsUpdate =
    installed && compareVersions(version!, EXTENSION_EXPECTED_VERSION) < 0;
  return {
    installed,
    version,
    needsUpdate,
    expectedVersion: EXTENSION_EXPECTED_VERSION,
  };
}
