# Publication Chrome Web Store

Tout ce qu'il faut pour publier l'extension Star Gap Importer sur le Chrome Web Store.

## Coût et prérequis

- **5 $ one-time** : frais d'inscription au compte développeur (paiement par CB)
- Adresse mail Google (gmail OK)
- 24-72h de review Google avant publication

## Étape 1 — Compte développeur

1. Va sur https://chrome.google.com/webstore/devconsole
2. Connecte-toi avec ton compte Google
3. Accepte les conditions développeur
4. Paie les 5 $ d'inscription

## Étape 2 — Préparer le ZIP de l'extension

Le ZIP doit contenir uniquement les fichiers de l'extension (pas les README, pas le .git, etc.).

```bash
cd /Users/Romain.Thomas/GapViz/extension
# Bumper la version dans manifest.json si nécessaire (semver)
zip -r star-gap-importer-v0.1.0.zip \
  manifest.json \
  content-script.js \
  content-style.css \
  background.js \
  popup.html \
  popup.css \
  popup.js \
  icons/
```

⚠️ Vérifier que `manifest.json` n'a pas de `host_permissions` excessives (sinon review longue). Actuellement on a `app.ahrefs.com` + `functions.supabase.co` — c'est correct et défensif.

## Étape 3 — Métadonnées à remplir sur le Dashboard

### Nom de la fiche (langue par défaut : français)

```
Star Gap Importer
```

### Description courte (132 caractères max)

```
Importe tes mots-clés Ahrefs directement dans Star Gap en 1 clic, sans glisser-déposer de CSV.
```

### Description longue

```
Star Gap Importer connecte ton compte Ahrefs à Star Gap, l'outil d'analyse SEO et de clustering IA.

Au lieu d'exporter manuellement un CSV depuis Ahrefs et de le glisser dans Star Gap, l'extension fait le pont automatiquement : tu cliques sur "Importer depuis Ahrefs" dans ton projet Star Gap, l'extension t'amène sur la bonne page Ahrefs avec ton domaine pré-rempli, et au clic sur "Export" elle envoie tes mots-clés directement vers ton compte Star Gap.

➜ Comment ça marche
1. Crée un projet sur Star Gap (https://rom74274.github.io/GapViz/)
2. Renseigne ton domaine et clique "Importer depuis Ahrefs"
3. L'extension ouvre Ahrefs et te guide jusqu'au bouton Export
4. Au clic Export, tes mots-clés sont envoyés à Star Gap en quelques secondes
5. Tu es redirigé automatiquement vers ton projet, prêt pour le clustering IA

➜ Données importées
- Mots-clés organiques (jusqu'à plusieurs milliers par export)
- Volume, KD, CPC, position, URL
- Pays cible

➜ Sécurité
- L'extension n'a accès qu'à app.ahrefs.com (où tu cliques Export)
- Les données transitent via une session sécurisée (token éphémère de 10 min)
- Aucune clé API stockée, aucun mot de passe demandé
- Les cookies Ahrefs restent dans ton navigateur

➜ Prérequis
- Un compte Ahrefs avec accès à Site Explorer (toute formule incluant l'export CSV)
- Un compte Star Gap (gratuit)

➜ Confidentialité
Cette extension est open source. Code et politique de confidentialité disponibles sur https://github.com/Rom74274/GapViz
```

### Catégorie

`Productivité` ou `Outils de développement`

### Langues supportées

`Français` (langue principale)

### Visuel d'icône

128x128 PNG → `icons/icon-128.png` (déjà généré)

### Captures d'écran (au moins 1, max 5, 1280x800 ou 640x400)

À faire côté toi :
1. Screenshot du panneau "Importer depuis Ahrefs" sur Star Gap NewProjectPage
2. Screenshot du banner violet "Star Gap connecté" sur Ahrefs
3. Screenshot du projet importé avec son graph
4. Screenshot du popup de l'extension

### Tuile promotionnelle (optionnel mais recommandé pour le marketing)

440x280 PNG. Tu peux faire un montage Figma rapide avec :
- Fond : gradient violet/noir Star Gap
- Logo Star Gap centré
- Tagline : "Importe tes KWs Ahrefs en 1 clic"

## Étape 4 — Privacy Policy

Lien obligatoire. On réutilise celui de l'app :

```
https://rom74274.github.io/GapViz/#/privacy
```

⚠️ Vérifier que la page mentionne bien l'extension Chrome dans ce qu'elle décrit.

## Étape 5 — Justifier les permissions

Chrome Web Store demande de justifier chaque permission. Voici les textes à coller :

### `downloads`

> L'extension intercepte les exports CSV téléchargés depuis Ahrefs pour les envoyer automatiquement vers le projet Star Gap de l'utilisateur. Aucun autre téléchargement n'est lu.

### `storage`

> Stocke temporairement un token de session d'import (UUID, 10 minutes) pour relier le clic Export sur Ahrefs au projet Star Gap correspondant.

### `tabs`

> Permet de fermer automatiquement l'onglet Ahrefs après que l'import soit terminé, et de communiquer le statut entre le content script et le popup.

### `activeTab`

> Lit l'URL de l'onglet actif pour détecter si l'utilisateur est sur Ahrefs et adapter l'interface du popup.

### Host permission `app.ahrefs.com/*`

> Injecte un bandeau d'instruction sur la page Organic Keywords pour guider l'utilisateur vers le bouton Export. Les autres pages Ahrefs ne sont pas modifiées.

### Host permission `kngkvaqovdnysmqrvxtj.functions.supabase.co/*`

> Envoie le CSV récupéré vers l'Edge Function Star Gap (notre backend Supabase) pour qu'il soit traité et associé au compte de l'utilisateur.

## Étape 6 — Submit

1. Upload le ZIP via le bouton "Nouvel élément" du Dashboard
2. Remplis toutes les métadonnées ci-dessus
3. Soumets pour examen
4. Attente Google : 24-72h en moyenne (parfois jusqu'à 7 jours)
5. Si refus : Google explique pourquoi, tu corriges, tu re-soumets

## Étape 7 — Après publication

L'extension reçoit un ID public (format `abcdefghijklmnop...`). Cet ID :
- Apparaît dans l'URL Chrome Web Store : `chrome.google.com/webstore/detail/.../<ID>`
- Est utilisé pour les liens d'installation directs

À mettre à jour dans Star Gap :
- `src/pages/SettingsPage.tsx` (ou un futur "Comment ça marche") → ajouter un bouton "Installer l'extension Chrome" qui pointe vers la fiche Chrome Web Store
- `extension/popup.html` → le lien actuel pointe vers Star Gap, garder ainsi

## Mises à jour futures

Pour publier une nouvelle version :
1. Bumper `version` dans `manifest.json` (ex: `0.1.0` → `0.1.1`)
2. Re-zipper et upload via le Dashboard
3. Google review (généralement plus rapide pour les mises à jour, < 24h)
4. Les users existants reçoivent l'update automatiquement
