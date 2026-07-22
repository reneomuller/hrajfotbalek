-- =============================================================================
-- Migration 14 — waitlist_position (owner-only, read)
--
-- A waitlisted player is shown where they stand ("You're #2 in line"). Their
-- own `waitlist` row is readable under `waitlist_select_own`, but a POSITION is
-- a fact about everyone else's rows, which own-row RLS correctly hides — a
-- client-side count would return 1 for every player on the list. So the count
-- happens inside a SECURITY DEFINER function that projects a single integer and
-- nothing else: no other player's id, nickname or join time ever crosses the
-- boundary.
--
-- INFORMATIONAL, NOT A PROMISE. Notification stays notify-all FCFS (the
-- deferred policy-v1 ruling): everyone waiting is told at the same moment and
-- the first to claim the spot gets it. This number says how many people joined
-- ahead of the caller, not who gets served first. The UI keeps the
-- everyone-is-told-at-once line next to it for exactly that reason.
--
-- Ordering is `joined_at` with `player_id` as the tie-break, so two rows
-- stamped in the same microsecond still get distinct, stable positions.
--
-- Rollback: supabase/rollback/20260722100000_rpc_waitlist_position_down.sql
-- =============================================================================

create function public.waitlist_position(p_game_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_joined_at timestamptz;
  v_position  integer;
begin
  -- Identity from auth.uid(), never a client-supplied id. A caller with no
  -- player row has no position — null, not an error: the game page renders for
  -- anonymous visitors too and a raise here would break it.
  v_player_id := public.current_player_id();
  if v_player_id is null then
    return null;
  end if;

  select w.joined_at into v_joined_at
    from public.waitlist w
   where w.game_id = p_game_id
     and w.player_id = v_player_id
     and w.converted_booking_id is null;

  -- Not on the list (or already converted to a booking) — nothing to report.
  if not found then
    return null;
  end if;

  select count(*)::integer into v_position
    from public.waitlist w
   where w.game_id = p_game_id
     and w.converted_booking_id is null
     and (
       w.joined_at < v_joined_at
       or (w.joined_at = v_joined_at and w.player_id <= v_player_id)
     );

  return v_position;
end;
$$;

revoke execute on function public.waitlist_position(uuid) from public;
grant execute on function public.waitlist_position(uuid) to authenticated, service_role;

comment on function public.waitlist_position(uuid) is
  'Owner-only. The calling player''s 1-based position on a game''s waitlist, '
  'ordered by joined_at with player_id as tie-break, or null when the caller '
  'is not on the list. Informational only: notification is notify-all FCFS.';
