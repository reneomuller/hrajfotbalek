-- =============================================================================
-- Migration 17 — mark_attendance, and the settle guard
--
-- ATTENDANCE IS A STATE-BEARING WRITE. `bookings.attendance` drives the
-- no-show metric and the settle gate, and its `attendance_marked` event is what
-- Phase 26 counts. A server action doing `.update()` and then logging the event
-- separately has a window where the two disagree — and a stamp without its
-- event corrupts both consumers at once, silently.
--
-- ADMIN-ONLY, ENFORCED INSIDE THE FUNCTION. Marking someone a no-show is a
-- consequential act with money attached: it is the difference between a spot
-- that was used and a spot that was wasted. It must not be reachable by the
-- player it describes, which is why the check is `is_admin_caller() or
-- is_service_role()` and not "owns the booking".
--
-- THE SETTLE GUARD, and why it belongs here rather than in the admin panel.
-- A `reserved` booking surviving into `settled` is an unreconciled debt with no
-- surface that will ever raise it again — the game is closed, the reconciliation
-- list is empty, and the money is simply gone from view. A UI-only check would
-- hold right up until someone called `settle_game` from anywhere else. So
-- `settle_game` is replaced below with the same body plus the refusal; the
-- admin panel surfaces WHICH bookings are outstanding, which is the part a UI
-- is actually better at.
--
-- Rollback: supabase/rollback/20260722120000_rpc_mark_attendance_down.sql
-- =============================================================================

create function public.mark_attendance(
  p_booking_id uuid,
  p_attendance public.attendance_status
)
returns public.attendance_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'mark_attendance requires an admin session or service role';
  end if;

  if p_attendance is null then
    raise exception 'INVALID_ATTENDANCE';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- A cancelled or expired booking was already settled by its own transition:
  -- the spot was released and any money already accounted for. Marking it
  -- present or absent now would add an attendance fact about a spot nobody
  -- held, and the no-show rate would count it.
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  update public.bookings
     set attendance = p_attendance
   where id = p_booking_id;

  -- Same transaction as the write above. Re-marking is allowed (an organizer
  -- correcting themselves) and emits a second event: the log is append-only,
  -- so a correction is a new fact rather than an edit to an old one.
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('attendance_marked', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'attendance', p_attendance::text,
            'marked_by', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  return p_attendance;
end;
$$;

revoke execute on function public.mark_attendance(uuid, public.attendance_status) from public;
revoke execute on function public.mark_attendance(uuid, public.attendance_status) from anon;
grant execute on function public.mark_attendance(uuid, public.attendance_status) to authenticated, service_role;

comment on function public.mark_attendance(uuid, public.attendance_status) is
  'Admin-only. Writes bookings.attendance and its attendance_marked event in '
  'one transaction. Rejects a booking that is not reserved or confirmed.';

-- -----------------------------------------------------------------------------
-- settle_game — unchanged except for the unpaid-reservation refusal
-- -----------------------------------------------------------------------------

create or replace function public.settle_game(p_game_id uuid)
returns public.game_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game     public.games%rowtype;
  v_reserved integer;
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

  -- Every unpaid hold must be resolved first: paid on the pitch (an admin
  -- confirm_booking) or cancelled after a no-show. Counted under the game lock
  -- taken above, so a confirm landing concurrently cannot slip past it.
  select count(*) into v_reserved
    from public.bookings b
   where b.game_id = p_game_id and b.status = 'reserved';

  if v_reserved > 0 then
    raise exception 'RESERVED_BOOKINGS_REMAIN'
      using detail = 'unpaid reservations: ' || v_reserved::text;
  end if;

  update public.games set status = 'settled' where id = p_game_id;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('game_settled', p_game_id, '{}'::jsonb, v_game.city, v_game.brand);

  return 'settled';
end;
$$;

comment on function public.settle_game(uuid) is
  'Admin-or-service-role. Refuses while any booking on the game is still '
  'reserved: an unpaid hold surviving into settled is a debt with no surface '
  'left to raise it.';
