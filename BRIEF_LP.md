# Brief Landing Page — Star Gap

## Le produit

**Star Gap** est un SaaS d'analyse SEO et de clustering de mots-clés. Il permet aux SEO de visualiser leurs gaps concurrentiels et d'organiser leur stratégie de contenu grâce à un clustering IA.

**App live** : https://rom74274.github.io/GapViz (futur : app.stargap.io)

## Cible

- SEO freelances / consultants SEO indépendants
- Agences SEO / agences digitales avec un portefeuille de clients
- Responsables SEO in-house (PME/startups tech)
- Marché francophone principalement (FR, BE, CH, CA)

## Problème résolu

Un SEO qui veut analyser sa position vs ses concurrents doit aujourd'hui :
1. Exporter des CSVs depuis Ahrefs/Semrush/GSC pour chaque site
2. Les croiser manuellement dans un tableur (Google Sheets, Excel)
3. Regrouper les mots-clés par thème à la main (clustering manuel, très long)
4. Identifier visuellement où sont les gaps (KWs où les concurrents rankent mais pas toi)
5. Prioriser la production de contenu

Star Gap automatise les étapes 2 à 5 en quelques clics.

## Flow utilisateur

1. **Crée un projet** : nom, domaine principal, pays, concurrents
2. **Importe les CSVs** : drag & drop, détection automatique des colonnes (Ahrefs, Semrush, GSC supportés)
3. **Lance le clustering** : Claude (IA Anthropic) regroupe les mots-clés en clusters thématiques en 30s-2min
4. **Visualise** : graph interactif (force-directed, D3.js) avec clusters colorés, zoom, recherche, filtres
5. **Analyse les gaps** : KWs où les concurrents rankent mais pas toi, mis en évidence visuellement
6. **Exporte** : CSV brut ou Content Plan priorisé (P1/P2/P3 par volume × ease)

## Fonctionnalités clés

### Clustering IA
- Modèle Claude (Anthropic) — Haiku pour Free, Sonnet pour Pro/Agency
- Chunking automatique pour les gros corpus (>500 KWs)
- Naming des clusters en français, actionnable ("Gestion des congés", pas "RH")
- Cluster "Non clusterisé" pour les outliers
- Mode managé (infrastructure Star Gap) ou BYOK (ta propre clé Claude API)

### Visualisation graph
- Graph force-directed interactif (D3.js + Canvas)
- Clusters colorés avec méta-nœuds
- Zoom, pan, recherche par mot-clé
- Tooltip au hover (volume, position, KD, sources)
- Labels optionnels, glow effect
- Starfield ambient en background (dark mode)

### Vue tableau
- Toutes les colonnes : keyword, volume, KD, CPC, position, acteurs, cluster, intent, gap
- Tri multi-colonnes, sélection multiple
- Filtres avancés (volume, KD, position, cluster, intent, gaps only, branded)

### Export
- CSV brut (1 ligne par source, trié par volume)
- Batch Content Plan (priorités P1/P2/P3, KWs secondaires du cluster, type de page suggéré)

### Multi-sources
- Ahrefs (Organic Keywords export)
- Semrush (Organic Research export)
- Google Search Console (Performance export)
- Détection automatique du format + mapping des colonnes

## Plans et tarifs

| | Free | Pro | Agency |
|---|---|---|---|
| Prix | 0€ | 19€/mois | 79€/mois |
| Annuel | — | 15,20€/mois (-20%) | 63,20€/mois (-20%) |
| Projets | 1 | 5 | Illimité |
| KWs/projet | 500 | 5 000 | Illimité |
| Concurrents/projet | 3 | 10 | Illimité |
| Clusterings managés/mois | 2 | 20 | Illimité |
| Export CSV | Non | Oui | Oui |
| Vue tableau | 20 lignes (reste flouté) | Complète | Complète |
| Watermark graph | Oui | Non | Non |
| BYOK Claude API | Oui (illimité) | Oui (illimité) | Oui (illimité) |
| Modèle managé | Haiku | Sonnet | Sonnet |

Paiement Stripe. Annulation à tout moment via le portail Stripe.

## Stack technique (pour contexte, pas à mettre sur la LP)

- Frontend : React 19 + TypeScript + Vite + Tailwind CSS
- Backend : Supabase (Auth + PostgreSQL + Edge Functions Deno)
- IA : Anthropic Claude API (Haiku / Sonnet)
- Paiement : Stripe Checkout + Webhooks + Customer Portal
- Hébergement : GitHub Pages (app) + Supabase (DB + functions)
- Cache local : IndexedDB via Dexie (write-through depuis Supabase)

## Ton et positionnement

- **Ton** : direct, technique mais accessible. Pas de bullshit marketing. Parle comme un SEO parle à un autre SEO.
- **Langue** : français
- **Positionnement** : outil pragmatique, pas une usine à gaz. "Import tes CSVs, lance le clustering, visualise tes gaps. C'est tout."
- **Différenciation** :
  - Clustering IA (pas juste un croisement de tableaux)
  - Visualisation graph (pas juste un tableur)
  - Multi-sources (Ahrefs + Semrush + GSC dans le même projet)
  - Prix accessible (19€/mois vs outils à 99-299€/mois)
  - BYOK : tu peux utiliser ta propre clé Claude API pour rester illimité

## Éléments visuels suggérés pour la LP

- Screenshot du graph avec clusters colorés + starfield background (le plus impactant visuellement)
- Screenshot de la vue tableau avec filtres
- Screenshot de la page /pricing avec le toggle mensuel/annuel
- Schéma du flow en 3 étapes (import → cluster → visualise)
- Éventuellement un GIF/vidéo courte du clustering en action

## Sections suggérées pour la LP

1. **Hero** : headline + sous-titre + CTA "Essayer gratuitement" + screenshot
2. **Problème** : "Tu passes des heures à croiser des tableurs ?"
3. **Solution** : flow en 3 étapes illustré
4. **Features** : clustering IA, graph interactif, multi-sources, export
5. **Pricing** : les 3 plans avec toggle mensuel/annuel
6. **FAQ** : questions courantes (quels formats supportés ? données stockées où ? BYOK c'est quoi ?)
7. **CTA final** : "Crée ton premier projet gratuitement"
8. **Footer** : liens légaux (mentions légales, confidentialité, CGV déjà live sur l'app)

## URLs des pages légales (déjà live)

- Mentions légales : https://rom74274.github.io/GapViz/#/legal
- Confidentialité : https://rom74274.github.io/GapViz/#/privacy
- CGV : https://rom74274.github.io/GapViz/#/cgv

## Contact

- Email : r.thomas74274@gmail.com
- Éditeur : Romain Thomas, auto-entrepreneur, 3 rue Mignard
