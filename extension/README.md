# Star Gap Importer — Extension Chrome

Importe tes mots-clés Ahrefs directement dans Star Gap en 1 clic.

## Installation (mode développeur)

Tant que l'extension n'est pas publiée sur le Chrome Web Store, on la charge en local :

1. Ouvre Chrome → `chrome://extensions`
2. Active le **"Mode développeur"** (toggle en haut à droite)
3. Clique **"Charger l'extension non empaquetée"**
4. Sélectionne le dossier `/Users/Romain.Thomas/GapViz/extension/`
5. L'extension apparaît dans la liste avec le logo Star Gap

Tu peux maintenant :
- Voir l'icône Star Gap dans la barre Chrome (épingle-la depuis le menu puzzle 🧩)
- Cliquer dessus → popup avec instructions
- Va sur `app.ahrefs.com` → ouvre la console (F12 → Console). Tu dois voir `[Star Gap] Extension chargée…`

## Structure

```
extension/
├── manifest.json       # Déclaration Manifest V3
├── content-script.js   # Injecté sur app.ahrefs.com/*
├── content-style.css   # Styles isolés (préfixe sg-)
├── background.js       # Service worker
├── popup.html          # UI de la popup (clic icône)
├── popup.css
├── popup.js
└── icons/              # 16x16, 48x48, 128x128
    ├── icon.svg        # Source
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Permissions demandées

| Permission | Pourquoi |
|---|---|
| `downloads` | Intercepter le téléchargement du CSV Ahrefs |
| `storage` | Stocker le token de session (lié à un projet Star Gap) |
| `tabs` | Fermer automatiquement l'onglet Ahrefs après l'import |
| `activeTab` | Lire l'URL de l'onglet courant (détecter Ahrefs) |
| Host : `app.ahrefs.com/*` | Injection du content script |
| Host : `kngkvaqovdnysmqrvxtj.functions.supabase.co/*` | Envoi du CSV à l'Edge Function Star Gap |

## Avancement (par commit)

- [x] **Commit 1** — Setup : manifest, structure, popup, icons, content script qui détecte la page Organic Keywords
- [x] **Commit 2** — Injection du banner sur la page Ahrefs (instruction "clique Export")
- [x] **Commit 3** — Interception du download CSV via `chrome.downloads`
- [x] **Commit 4** — SQL `import_sessions` + Edge Function `extension-import`
- [x] **Commit 5** — Bouton "Importer depuis Ahrefs" dans NewProjectPage + génération du token
- [ ] **Commit 6** — Polling status + redirect vers le projet créé
- [ ] **Commit 7** — Polish (erreurs, session expirée, timeout)
- [ ] **Commit 8** — Publication Chrome Web Store

## Recharger après modification

À chaque modification d'un fichier de l'extension :
1. `chrome://extensions`
2. Bouton 🔄 sur la card de l'extension Star Gap
3. Recharger aussi la page Ahrefs (F5) pour que le nouveau content script se ré-injecte
