-- Rollback for 20260722120000_rpc_mark_attendance.sql
--
-- Restores settle_game to its Phase 7 body (migration 20260720130000) — the
-- same function without the unpaid-reservation refusal.

drop function if exists public.mark_attendance(uuid, public.attendance_status);

create or replace function public.settle_game(p_game_id uuid)
returns public.game_status
language plpgsql
security definer
set search_path = ''
as $$
declare v_game public.games%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));
  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  if v_game.status <> 'played' then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  update public.games set status = 'settled' where id = p_game_id;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('game_settled', p_game_id, '{}'::jsonb, v_game.city, v_game.brand);

  return 'settled';
end;
$$;
