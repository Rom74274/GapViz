-- =============================================================================
-- Correctif : "permission denied for function consume_clustering_quota"
-- =============================================================================
-- La migration précédente révoquait l'exécution pour `authenticated`, mais
-- l'edge function `cluster` appelle ces RPC avec le JWT de l'utilisateur (client
-- anon + Authorization header), pas avec la service_role → permission denied.
--
-- Fix sécurisé : on dérive l'identité de `auth.uid()` (l'utilisateur ne peut
-- donc agir QUE sur son propre quota, même s'il passait un autre p_user_id), et
-- on re-grant l'exécution à `authenticated`. p_user_id reste utilisé en repli
-- pour un éventuel appel service_role (auth.uid() null).
-- =============================================================================

create or replace function public.consume_clustering_quota(
  p_user_id uuid,
  p_quota integer,
  p_window_seconds integer default 2592000
)
returns table (allowed boolean, used integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(auth.uid(), p_user_id);
  v_used integer;
  v_reset timestamptz;
begin
  if v_uid is null then
    raise exception 'no user identity';
  end if;

  select clusterings_used, clusterings_reset_at
    into v_used, v_reset
    from profiles
   where id = v_uid
   for update;

  if not found then
    raise exception 'profile not found for %', v_uid;
  end if;

  v_used := coalesce(v_used, 0);
  v_reset := coalesce(v_reset, now());

  if now() - v_reset >= make_interval(secs => p_window_seconds) then
    v_used := 0;
    v_reset := now();
  end if;

  if p_quota is not null and v_used >= p_quota then
    update profiles set clusterings_reset_at = v_reset where id = v_uid;
    return query select false, v_used, v_reset;
    return;
  end if;

  v_used := v_used + 1;
  update profiles
     set clusterings_used = v_used,
         clusterings_reset_at = v_reset
   where id = v_uid;

  return query select true, v_used, v_reset;
end;
$$;

create or replace function public.refund_clustering_quota(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_uid is null then
    return;
  end if;
  update profiles
     set clusterings_used = greatest(0, coalesce(clusterings_used, 0) - 1)
   where id = v_uid;
end;
$$;

grant execute on function public.consume_clustering_quota(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.refund_clustering_quota(uuid) to authenticated, service_role;
