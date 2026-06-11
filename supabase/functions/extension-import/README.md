# Edge Function `extension-import`

Reçoit un CSV Ahrefs depuis l'extension Chrome Star Gap + un token de session,
crée un projet avec les mots-clés importés.

## Prérequis SQL — table `import_sessions`

À exécuter une seule fois dans Supabase SQL Editor :

```sql
create table if not exists public.import_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'expired')),
  project_id uuid references public.projects(id) on delete set null,
  domain text,
  source text,
  error_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz
);

alter table public.import_sessions enable row level security;

-- L'utilisateur peut lire/update ses propres sessions (pour le polling depuis l'app).
create policy "Users manage own import sessions"
  on public.import_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_import_sessions_user_status on public.import_sessions(user_id, status);
create index if not exists idx_import_sessions_expires on public.import_sessions(expires_at) where status = 'pending';
```

## Variables d'environnement

Utilise les secrets existants — rien de nouveau à ajouter :
- `SUPABASE_URL` : auto-injecté
- `SB_SERVICE_ROLE_KEY` : déjà set (utilisé aussi par stripe-webhook)

## Déploiement

```bash
supabase functions deploy extension-import --no-verify-jwt
```

`--no-verify-jwt` car la fonction est appelée par l'extension Chrome (pas
de JWT user). Sécurité = validation du token côté Edge Function (token
UUID, expire en 10 min, scope par user_id stocké en DB).

## Endpoint

```
POST https://kngkvaqovdnysmqrvxtj.functions.supabase.co/extension-import
```

## Format de requête

**Option A : multipart/form-data** (recommandé, l'extension utilisera ça)

```
Content-Type: multipart/form-data

token: <uuid de la session import>
csv: <fichier CSV Ahrefs>
domain: <domaine, optionnel — sinon récupéré depuis la session>
source: ahrefs
```

**Option B : application/json** (CSV en base64, plus simple à tester)

```json
{
  "token": "uuid-...",
  "csv_base64": "...",
  "domain": "skello.io",
  "source": "ahrefs"
}
```

## Réponse

Succès :
```json
{
  "ok": true,
  "project_id": "uuid-...",
  "keyword_count": 1247,
  "position_count": 1247
}
```

Erreurs :
- `400 token_and_csv_required` : champs manquants
- `400 empty_csv` : CSV sans données
- `400 parsing_failed` + `message` : CSV malformé
- `401 invalid_or_expired_token` : token inconnu ou périmé
- `500 *_insert_failed` : erreur Postgres lors de l'insertion

## Test rapide

1. **Crée une session manuellement** (depuis le SQL Editor pour le test) :

```sql
insert into public.import_sessions (user_id, domain, source)
values ('<ton-user-id>', 'skello.io', 'ahrefs')
returning token;
```

2. **Récupère un CSV Ahrefs** localement (téléchargé via le bouton Export d'Ahrefs).

3. **POST avec curl** (le CSV est en UTF-16 LE, on l'envoie raw via multipart) :

```bash
curl -X POST \
  -F "token=<le-token-de-l-etape-1>" \
  -F "csv=@/Users/Romain.Thomas/Downloads/ahrefs.com_organic-keywords_xxx.csv" \
  -F "domain=skello.io" \
  https://kngkvaqovdnysmqrvxtj.functions.supabase.co/extension-import
```

Tu dois récupérer un JSON `{ "ok": true, "project_id": "...", ... }`.

4. **Vérifie côté app** : va sur Star Gap, le projet doit apparaître dans la liste.
