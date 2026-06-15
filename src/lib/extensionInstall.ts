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

const ATTR = 'data-stargap-extension';

export function detectExtensionSync(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute(ATTR);
}

export function useExtensionInstalled(): {
  installed: boolean;
  version: string | null;
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

  return { installed: version !== null, version };
}
