-- =============================================================================
-- Migration 11 — join_waitlist (owner-only)
--
-- `waitlist` is a state-bearing table, so the row and its `waitlist_joined`
-- event must be written together. A server action doing insert-then-log has a
-- window where the two disagree, and Phase 26's waitlist-depth metric reads the
-- event log — so a row without its event is a silently wrong number later.
--
-- Same conventions as Phases 5-7: SECURITY DEFINER, search_path='', every
-- reference schema-qualified, authorization inside the function.
--
-- Rollback: supabase/rollback/20260721100000_rpc_join_waitlist_down.sql
-- =============================================================================

create type public.waitlist_join_result as (
  id             uuid,
  already_joined boolean
);

create function public.join_waitlist(p_game_id uuid)
returns public.waitlist_join_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id   uuid;
  v_game        public.games%rowtype;
  v_waitlist_id uuid;
begin
  -- Identity from auth.uid(), never a client-supplied id.
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- Joining is only meaningful on a full game. A published game has spots, so
  -- the player should book one; anything terminal has nothing to wait for.
  if v_game.status <> 'full' then
    raise exception 'GAME_NOT_WAITLISTABLE'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  if v_game.starts_at <= now() then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  -- DEDUPE BY CONSTRAINT, NOT BY READ-THEN-WRITE. A select-then-insert pair
  -- races against itself: two concurrent taps both see no row and both insert.
  -- The unique constraint is the authority; a second join is a friendly
  -- already-joined state rather than an error the player has to interpret.
  begin
    insert into public.waitlist (game_id, player_id)
    values (p_game_id, v_player_id)
    returning id into v_waitlist_id;
  exception
    when unique_violation then
      select w.id into v_waitlist_id
        from public.waitlist w
       where w.game_id = p_game_id and w.player_id = v_player_id;
      return (v_waitlist_id, true)::public.waitlist_join_result;
  end;

  insert into public.events (event_type, player_id, game_id, metadata, city, brand)
  values ('waitlist_joined', v_player_id, p_game_id,
          jsonb_build_object('waitlist_id', v_waitlist_id),
          v_game.city, v_game.brand);

  return (v_waitlist_id, false)::public.waitlist_join_result;
end;
$$;

revoke execute on function public.join_waitlist(uuid) from public;
grant execute on function public.join_waitlist(uuid) to authenticated, service_role;

comment on function public.join_waitlist(uuid) is
  'Owner-only waitlist join on a full game. Writes the waitlist row and its '
  'waitlist_joined event in one transaction. Duplicate joins are deduped by '
  'the unique constraint and reported as already_joined rather than raised.';
