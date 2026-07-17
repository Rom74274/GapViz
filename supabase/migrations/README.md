# Migrations Supabase — Star Gap

Jusqu'ici le schéma (tables, colonnes Stripe, policies RLS) n'était **versionné nulle part** :
la base existait en prod mais aucun `.sql` dans le repo. Ce dossier corrige ça.

Projet lié : `kngkvaqovdnysmqrvxtj` (voir `../.temp/linked-project.json`).

---

## ⚠️ Règle d'or : tester sur une branche AVANT la prod

Une migration qui ajoute des triggers peut, si elle est bugguée, **bloquer toutes les
insertions**. Ne pousse JAMAIS directement en prod sans avoir validé sur une branche.

```bash
# Crée une branche de preview (base de données jetable, isolée de la prod)
supabase branches create test-plan-limits
# …applique et teste dessus (voir plus bas)…
# quand c'est validé :
supabase branches delete test-plan-limits
```

---

## Étape 1 — Capturer le schéma existant (#1)

`supabase db pull` introspecte la base **de prod** et écrit un fichier baseline
`<timestamp>_remote_schema.sql` contenant tables + colonnes + RLS actuelles.
Nécessite le **mot de passe DB** (Dashboard → Project Settings → Database) — il te
sera demandé, ou passe-le via `SUPABASE_DB_PASSWORD`.

```bash
cd supabase
supabase db pull            # → crée migrations/<timestamp>_remote_schema.sql
```

Après ça, le schéma est versionné. Commit le fichier généré.

> **Ordre des migrations** : `db pull` horodate le baseline à l'instant présent. Si son
> timestamp est **postérieur** à `20260717120100_enforce_plan_limits.sql`, renomme le
> fichier d'enforcement avec un timestamp plus grand (ex. `+1`) pour qu'il s'applique
> APRÈS le baseline lors d'un rebuild (`supabase db reset`). Pour un simple `db push`
> sur la base existante (tables déjà présentes), l'ordre n'a pas d'impact car
> l'enforcement est purement additif et idempotent.

---

## Étape 2 — Appliquer l'enforcement des limites de plan (#2)

`20260717120100_enforce_plan_limits.sql` ajoute :
- une table `plan_limits` (source de vérité DB, alignée sur `src/lib/plans.ts`) ;
- 3 triggers Postgres qui bloquent les dépassements **quel que soit le chemin d'écriture**
  (client JS, REST, console) :
  - `projects` : max projets / utilisateur ;
  - `keywords` : max mots-clés / projet (statement-level, compatible avec les inserts par lots de 500) ;
  - `competitors` : max concurrents / projet.

Le quota de **clustering** est déjà appliqué serveur dans l'Edge Function `cluster`
(le BYOK reste illimité par design — l'utilisateur paie sa propre clé).

### Appliquer

```bash
# Sur la branche de test d'abord :
supabase db push

# Vérifier que les triggers sont là :
supabase db execute --query "select tgname from pg_trigger where tgname like 'trg_enforce%';"
```

### Tester le blocage (sur la branche)

Avec un utilisateur Free, tenter de créer un 2ᵉ projet doit échouer avec
`plan_limit_projects`. Idem 501 mots-clés (`plan_limit_keywords`) et 4 concurrents
(`plan_limit_competitors`). Un compte Agency ne doit jamais être bloqué.

### Ajuster une limite plus tard (sans redéploiement)

```sql
update public.plan_limits set max_keywords_per_project = 10000 where plan = 'pro';
```
Pense à mettre à jour aussi `src/lib/plans.ts` pour que l'UI (UpgradeModal) reste cohérente.

---

## Côté application

Les gardes front-end (`NewProjectPage`, `ExportButton`) restent en place pour l'UX
(message clair + UpgradeModal). Les triggers sont la **défense en profondeur** : si le
front est contourné, l'insert lève une erreur `check_violation` que `write.ts` remonte.
Optionnel : mapper ces erreurs (`hint = plan_limit_*`) vers un message FR / l'UpgradeModal.
