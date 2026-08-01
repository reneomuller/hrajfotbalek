-- Rollback for 20260802110000_rpc_admin_games_phase2.sql
--
-- Drops only the v2 pair and the two helpers. The v1 functions from migration
-- 16 were never touched, so rolling back here leaves a working — if narrower —
-- admin game path rather than none at all.
--
-- The COLUMNS survive this rollback: they belong to migration 26, and rows
-- already carrying a duration or a skill restriction keep them. Only the way
-- to write them from an admin session goes away.

drop function if exists public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
);
drop function if exists public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
);
drop function if exists public.normalize_skill_levels(public.skill_level[]);
drop function if exists public.assert_game_shape(integer, integer);

-- Restores migration 27's narrower guard on set_game_organizer. Rolling the v2
-- pair back removes the only caller that needed the service-role branch, so
-- the function goes back to admin-session-only rather than keeping a widening
-- with nothing left to justify it.
create or replace function public.set_game_organizer(
  p_game_id uuid,
  p_organizer_name text,
  p_organizer_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;

  if p_organizer_name is null or btrim(p_organizer_name) = '' then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;

  v_phone := nullif(btrim(coalesce(p_organizer_phone, '')), '');

  insert into public.game_organizer_contacts (game_id, organizer_name, organizer_phone)
  values (p_game_id, btrim(p_organizer_name), v_phone)
  on conflict (game_id) do update
    set organizer_name = excluded.organizer_name,
        organizer_phone = excluded.organizer_phone,
        updated_at = now();
end $$;
