-- =============================================================================
-- Migration 5 — admin_create_booking (act-on-behalf entry point)
--
-- Phase 23 needs an admin to book ON BEHALF OF another player — typically a
-- shadow player who has never logged in and has no session to act under.
--
-- create_booking cannot serve this. Its entire safety story is that identity
-- comes from auth.uid() and a client-supplied player id is rejected. Relaxing
-- that to "accept a player_id when the caller is an admin" would put the
-- owner-only path and the act-on-behalf path in one function, one branch
-- apart, which is exactly where an authorization bug hides best. So this is a
-- second, separate entry point over the SAME internal body.
--
-- LOCK ORDER: player, then game (inside create_booking_internal).
--
-- Rollback: supabase/rollback/20260720110100_rpc_admin_create_booking_down.sql
-- =============================================================================

create function public.admin_create_booking(
  p_game_id        uuid,
  p_player_id      uuid,
  p_payment_method public.payment_method
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.booking_result;
  v_game   public.games%rowtype;
begin
  -- Authorization inside the function. The service-role key grants reach, not
  -- permission — reaching the function is not the same as being allowed to
  -- run it, so the check happens here and not at the grant layer.
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_create_booking requires an admin session or service role';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Same narrowed domain as create_booking. Admin privilege does NOT widen it:
  -- an admin booking a seed player still gets seed_free because the player's
  -- is_seed flag says so, not because the admin said so. (The internal body
  -- rejects it too; stated here so the refusal is visible at this entry point.)
  if p_payment_method is null or p_payment_method not in ('qr', 'cash') then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'payment_method must be qr or cash; credit and seed_free are derived';
  end if;

  -- booked_by_admin = true is what makes the two paths distinguishable in the
  -- roster, in Phase 26's stats, and in any later audit. create_booking never
  -- sets it; this function always does.
  v_result := public.create_booking_internal(
    p_game_id, p_player_id, p_payment_method, null, true);

  select * into v_game from public.games g where g.id = p_game_id;

  -- BOTH events fire, in the same transaction as the state change:
  -- booking_created because a booking was created and every downstream
  -- consumer (email dispatch, stats funnel) keys on it, and
  -- admin_booking_created because the provenance is materially different and
  -- Phase 26's stats separate the two.
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('admin_booking_created', p_player_id, p_game_id, v_result.id,
          jsonb_build_object(
            'payment_method', v_result.payment_method,
            'acting_admin_player_id', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  return v_result;
end;
$$;

revoke execute on function public.admin_create_booking(uuid, uuid, public.payment_method) from public;
grant execute on function public.admin_create_booking(uuid, uuid, public.payment_method) to authenticated, service_role;

comment on function public.admin_create_booking(uuid, uuid, public.payment_method) is
  'Admin/service-role act-on-behalf booking entry point. Shares '
  'create_booking_internal with create_booking so capacity, credit and lock '
  'ordering cannot drift. Sets booked_by_admin and emits both booking_created '
  'and admin_booking_created.';
