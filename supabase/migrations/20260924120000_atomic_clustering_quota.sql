-- =============================================================================
-- Quota de clustering atomique (anti-abus par concurrence)
-- =============================================================================
-- Problème corrigé : l'edge function "cluster" lisait clusterings_used puis
-- l'incrémentait plus tard (read-then-write non atomique). Deux runs simultanés
-- pouvaient donc tous deux passer le check et dépasser le quota.
--
-- Solution : une fonction qui, sous VERROU DE LIGNE (SELECT ... FOR UPDATE),
--   1. applique le reset glissant (fenêtre 30 jours),
--   2. vérifie le quota,
--   3. incrémente et renvoie allowed=true si OK, sinon allowed=false SANS
--      incrémenter.
-- À appeler AVANT l'appel Claude (on réserve le slot). En cas d'échec du
-- clustering, refund_clustering_quota() rend le slot.
--
-- SECURITY DEFINER + search_path figé : la fonction s'exécute avec les droits du
-- propriétaire (bypass RLS maîtrisé), on la restreint à l'utilisateur courant.
-- =============================================================================

create or replace function public.consume_clustering_quota(
  p_user_id uuid,
  p_quota integer,           -- NULL = illimité (plan agency)
  p_window_seconds integer default 2592000  -- 30 jours
)
returns table (allowed boolean, used integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_reset timestamptz;
begin
  -- Verrou de ligne : sérialise les appels concurrents pour ce profil.
  select clusterings_used, clusterings_reset_at
    into v_used, v_reset
    from profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'profile not found for %', p_user_id;
  end if;

  v_used := coalesce(v_used, 0);
  v_reset := coalesce(v_reset, now());

  -- Reset glissant.
  if now() - v_reset >= make_interval(secs => p_window_seconds) then
    v_used := 0;
    v_reset := now();
  end if;

  -- Quota atteint → refus, on persiste quand même le reset éventuel.
  if p_quota is not null and v_used >= p_quota then
    update profiles
       set clusterings_reset_at = v_reset
     where id = p_user_id;
    return query select false, v_used, v_reset;
    return;
  end if;

  -- OK → on réserve un slot.
  v_used := v_used + 1;
  update profiles
     set clusterings_used = v_used,
         clusterings_reset_at = v_reset
   where id = p_user_id;

  return query select true, v_used, v_reset;
end;
$$;

-- Rend un slot précédemment réservé (si le clustering échoue). Plancher à 0.
create or replace function public.refund_clustering_quota(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
     set clusterings_used = greatest(0, coalesce(clusterings_used, 0) - 1)
   where id = p_user_id;
end;
$$;

-- Ces fonctions sont appelées par l'edge function via la service_role key.
-- On révoque l'accès public/anon par prudence (elles ne doivent pas être
-- appelables directement par un client authentifié).
revoke all on function public.consume_clustering_quota(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_clustering_quota(uuid) from public, anon, authenticated;
