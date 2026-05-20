# Edge Function `cluster`

Clustering managé Claude pour les utilisateurs sans BYOK. Étape 3a du brief SaaS.

## Modèle utilisé

- **Free** : `claude-haiku-4-5-20251001`
- **Pro / Agency** : `claude-sonnet-4-20250514`

(Définis dans `PLAN_MODELS` ici et dans `src/lib/plans.ts` côté browser — garder synchronisés.)

## Comportement

1. Vérifie le JWT utilisateur, charge le profile (plan / clusterings_used / clusterings_reset_at).
2. Applique le rolling reset 30j sur le compteur.
3. Gate quota selon `PLAN_QUOTAS` :
   - Free : 2 / mois
   - Pro : 20 / mois
   - Agency : illimité
4. Fetch `keywords` (RLS), trie par volume desc, chunk si > 500.
5. Appelle Claude (single-call ou chunked initial + followups).
6. Parse + sauvegarde clusters (mirror de `saveClusteringToSupabase`).
7. Incrémente `profiles.clusterings_used`.
8. Renvoie `{ ok, clusterCount, model, usage, clusteringsUsed, ... }`.

## Variables d'environnement requises

| Nom                    | Source                       |
| ---------------------- | ---------------------------- |
| `SUPABASE_URL`         | Auto (injectée par la plateforme) |
| `SUPABASE_ANON_KEY`    | Auto (injectée par la plateforme) |
| `ANTHROPIC_API_KEY`    | **Secret à définir manuellement** |

## Policies RLS prérequises

L'Edge Function s'authentifie avec le JWT user → toutes les opérations passent par RLS. Vérifier dans Supabase SQL Editor que ces policies existent :

```sql
-- profiles : l'utilisateur peut update sa propre row (pour clusterings_used).
create policy if not exists "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- keywords : update (pour cluster_id) sur les KWs des projets que je possède.
create policy if not exists "Users can update own keywords"
  on keywords for update
  using (project_id in (select id from projects where user_id = auth.uid()));

-- clusters : full CRUD sur les clusters des projets que je possède.
create policy if not exists "Users can manage own clusters"
  on clusters for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));
```

## Déploiement

L'utilisateur n'a pas la CLI Supabase installée. Procédure (à faire une fois) :

```bash
# 1. Installer la CLI
brew install supabase/tap/supabase

# 2. Login (ouvre un navigateur)
supabase login

# 3. Link au projet Star Gap
cd /Users/Romain.Thomas/GapViz
supabase link --project-ref kngkvaqovdnysmqrvxtj

# 4. Stocker le secret Anthropic
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 5. Deploy
supabase functions deploy cluster
```

Une fois déployée, l'URL est :
`https://kngkvaqovdnysmqrvxtj.functions.supabase.co/cluster`

(L'app utilisera `supabase.functions.invoke('cluster', { body: {...} })` côté client en étape 3b.)

## Test local

```bash
supabase start          # démarre la stack locale
supabase functions serve cluster --env-file .env  # avec ANTHROPIC_API_KEY=...
# Ensuite curl avec un JWT valide.
```

## Limites timeout

- Supabase free plan : timeout function ~150 s
- Pro plan : ~400 s

Un clustering chunked sur 5000 KWs = ~5 chunks de ~30s = ~150s — au bord pour le free plan. Si on dépasse, l'user peut basculer en BYOK (path client direct, pas de timeout).
