# GapViz

Visualise les clusters de mots-clés SEO et les gaps concurrentiels.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS
- Dexie (IndexedDB)
- React Router (HashRouter)
- D3.js (Canvas, à venir)
- Zustand
- Anthropic SDK (BYOK — clé API direct browser)
- vite-plugin-pwa
- Hosting : GitHub Pages

## Dev local

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## Déploiement

Push sur `main` → GitHub Actions build et déploie automatiquement sur GitHub Pages.

URL : https://Rom74274.github.io/GapViz/

## Architecture

```
src/
├── components/    # composants UI réutilisables
├── pages/         # pages (1 par route)
├── lib/
│   ├── db.ts      # schéma Dexie (IndexedDB)
│   ├── store.ts   # Zustand stores
│   ├── claude.ts  # client Anthropic SDK
│   ├── parsers/   # parsers CSV (Ahrefs, SEMrush, GSC) — à venir
│   └── utils.ts   # helpers (cn, etc.)
└── App.tsx        # routes
```

## V1 — features prévues

- [x] App shell + routing + design system
- [ ] Parser CSV multi-sources (Ahrefs / SEMrush / GSC)
- [ ] Création projet + ajout concurrents (couleurs)
- [ ] Clustering Claude avec cache
- [ ] MindMap interactive (D3 + Canvas)
- [ ] Filtres (concurrent, volume, KD, intent, gap)
- [ ] Sidebar détail au clic
- [ ] Export/import projet en JSON

## BYOK

Aucun backend. La clé API Anthropic est stockée en `localStorage` et utilisée pour appeler Claude directement depuis le navigateur. Le coût des analyses est donc à la charge de l'utilisateur (~$0.05-0.15 par projet de 1000 KWs avec Sonnet 4.6).
