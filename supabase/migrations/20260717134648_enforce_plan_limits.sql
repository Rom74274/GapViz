-- ============================================================================
-- Enforcement des limites de plan CÔTÉ SERVEUR (#2 du récap).
--
-- Contexte : jusqu'ici les limites (max projets / mots-clés / concurrents)
-- n'étaient vérifiées que côté client (NewProjectPage, ExportButton). Un
-- utilisateur Free pouvait les contourner en insérant en direct via l'API
-- Supabase (client JS, REST, console). Cette migration ajoute des triggers
-- Postgres BEFORE/AFTER INSERT qui bloquent tout dépassement, quel que soit
-- le chemin d'écriture.
--
-- Idempotent & additif : ne (re)crée que fonctions/triggers/ table de limites,
-- ne touche aucune table métier existante. Sûr à ré-exécuter.
--
-- ⚠️ À TESTER SUR UNE BRANCHE SUPABASE (preview) AVANT LA PROD — un trigger
--    mal calibré peut bloquer TOUTES les insertions. Voir migrations/README.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table de limites = source de vérité DB (tunable sans redéploiement).
--    Doit rester cohérente avec src/lib/plans.ts (PLAN_LIMITS).
--    NULL = illimité.
-- ----------------------------------------------------------------------------
create table if not exists public.plan_limits (
  plan                        text primary key,
  max_projects                integer,
  max_keywords_per_project    integer,
  max_competitors_per_project integer
);

insert into public.plan_limits
  (plan,     max_projects, max_keywords_per_project, max_competitors_per_project)
values
  ('free',   1,            500,                      3),
  ('pro',    5,            5000,                     10),
  ('agency', null,         null,                     null)
on conflict (plan) do update set
  max_projects                = excluded.max_projects,
  max_keywords_per_project    = excluded.max_keywords_per_project,
  max_competitors_per_project = excluded.max_competitors_per_project;

-- Lecture publique (les limites ne sont pas secrètes) ; aucune écriture client.
alter table public.plan_limits enable row level security;
drop policy if exists plan_limits_read on public.plan_limits;
create policy plan_limits_read on public.plan_limits
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 2. Projets — BEFORE INSERT FOR EACH ROW (faible volume).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_limit integer;
  v_count integer;
begin
  select plan into v_plan from profiles where id = new.user_id;
  v_plan := coalesce(v_plan, 'free');

  select max_projects into v_limit from plan_limits where plan = v_plan;
  if v_limit is null then
    return new; -- illimité (agency) ou plan inconnu → fail-open
  end if;

  select count(*) into v_count from projects where user_id = new.user_id;
  if v_count >= v_limit then
    raise exception 'Plan % : limite de % projet(s) atteinte.', v_plan, v_limit
      using errcode = 'check_violation', hint = 'plan_limit_projects';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_project_limit on public.projects;
create trigger trg_enforce_project_limit
  before insert on public.projects
  for each row execute function public.enforce_project_limit();

-- ----------------------------------------------------------------------------
-- 3. Mots-clés — AFTER INSERT FOR EACH STATEMENT (transition table).
--    Statement-level = 1 seule vérification par insert chunké (write.ts insère
--    par lots de 500), évite le O(n²) d'un trigger par ligne.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_keyword_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_plan  text;
  v_limit integer;
  v_total integer;
begin
  for r in select project_id, count(*) as added from new_rows group by project_id loop
    select coalesce(pr.plan, 'free'), pl.max_keywords_per_project
      into v_plan, v_limit
      from projects prj
      left join profiles pr on pr.id = prj.user_id
      left join plan_limits pl on pl.plan = coalesce(pr.plan, 'free')
      where prj.id = r.project_id;

    if v_limit is null then
      continue; -- illimité / projet ou plan introuvable
    end if;

    select count(*) into v_total from keywords where project_id = r.project_id;
    if v_total > v_limit then
      raise exception 'Plan % : limite de % mots-clés par projet atteinte.', v_plan, v_limit
        using errcode = 'check_violation', hint = 'plan_limit_keywords';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_enforce_keyword_limit on public.keywords;
create trigger trg_enforce_keyword_limit
  after insert on public.keywords
  referencing new table as new_rows
  for each statement execute function public.enforce_keyword_limit();

-- ----------------------------------------------------------------------------
-- 4. Concurrents — AFTER INSERT FOR EACH STATEMENT (par projet).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_competitor_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_plan  text;
  v_limit integer;
  v_total integer;
begin
  for r in select project_id, count(*) as added from new_rows group by project_id loop
    select coalesce(pr.plan, 'free'), pl.max_competitors_per_project
      into v_plan, v_limit
      from projects prj
      left join profiles pr on pr.id = prj.user_id
      left join plan_limits pl on pl.plan = coalesce(pr.plan, 'free')
      where prj.id = r.project_id;

    if v_limit is null then
      continue;
    end if;

    select count(*) into v_total from competitors where project_id = r.project_id;
    if v_total > v_limit then
      raise exception 'Plan % : limite de % concurrents par projet atteinte.', v_plan, v_limit
        using errcode = 'check_violation', hint = 'plan_limit_competitors';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_enforce_competitor_limit on public.competitors;
create trigger trg_enforce_competitor_limit
  after insert on public.competitors
  referencing new table as new_rows
  for each statement execute function public.enforce_competitor_limit();
