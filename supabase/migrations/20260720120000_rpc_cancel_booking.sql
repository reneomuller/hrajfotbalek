-- =============================================================================
-- Migration 6 — cancel_booking (owner-only)
--
-- Shares every Phase 5 convention: SECURITY DEFINER, search_path='',
-- schema-qualified references, authorization inside the function, and the same
-- PLAYER-THEN-GAME advisory lock order wherever both locks are taken.
--
-- No money ever leaves the system. A cancellation inside the window converts
-- what was paid into wallet credit; there is no cash-refund path anywhere in
-- this schema, by design.
--
-- Rollback: supabase/rollback/20260720120000_rpc_cancel_booking_down.sql
-- =============================================================================

create type public.cancel_result as (
  id uuid,
  status public.booking_status,
  credit_issued_czk integer,
  cancel_lead_hours numeric(6, 2)
);

create function public.cancel_booking(p_booking_id uuid)
returns public.cancel_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking     public.bookings%rowtype;
  v_game        public.games%rowtype;
  v_player_id   uuid;
  v_credit      integer;
  v_lead_hours  numeric(6, 2);
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  -- Read the booking BEFORE locking so we know which game to lock, then
  -- re-read under the locks. The pre-read is advisory only; the post-lock read
  -- is the one the decision is made on.
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Ownership is checked on the pre-read so a non-owner learns nothing further
  -- and takes no locks.
  if v_booking.player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'cancel_booking cancels only the calling player''s own booking';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(v_booking.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  -- Only an active booking can be cancelled. A transition absent from the
  -- booking state table is rejected rather than quietly no-op'd.
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  -- Window gate. After kickoff the outcome is determined solely by attendance
  -- marking, so there is no cancel path past that point.
  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'CANCEL_WINDOW_CLOSED'
      using detail = 'game status ' || v_game.status::text || ', starts_at ' || v_game.starts_at::text;
  end if;

  v_lead_hours := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  -- --- credit for money ACTUALLY APPLIED --------------------------------------
  --
  -- confirmed  -> the whole price is accounted for: whatever was not covered by
  --               credit was paid by QR or cash, and cash counts exactly like
  --               QR (no cash refund ever leaves the system).
  -- reserved   -> nothing was paid yet, but credit may already have been
  --               applied at booking time; return exactly that much.
  --
  -- A seed_free booking is confirmed at price 0, so this yields 0 — correct:
  -- no money was ever applied.
  if v_booking.status = 'confirmed' then
    v_credit := v_booking.price_czk;
  else
    v_credit := v_booking.credit_applied_czk;
  end if;

  update public.bookings
     set status = 'cancelled',
         cancel_lead_hours = v_lead_hours
   where id = p_booking_id;

  if v_credit > 0 then
    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'cancellation_credit', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object('amount_czk', v_credit, 'reason', 'cancellation_credit'),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_cancelled', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'previous_status', v_booking.status),
          v_game.city, v_game.brand);

  -- A spot genuinely became available. Not emitted when the game itself is
  -- cancelled — there is no spot to release in a game nobody is playing — but
  -- the window gate above already guarantees a live game here.
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('source', 'player_cancellation'),
          v_game.city, v_game.brand);

  -- full -> published now that a spot is free.
  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id, 'cancelled'::public.booking_status, v_credit, v_lead_hours)::public.cancel_result;
end;
$$;

revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated, service_role;

comment on function public.cancel_booking(uuid) is
  'Owner-only cancellation. Issues cancellation_credit for money actually '
  'applied (QR, cash and credit alike); an unpaid reservation issues none. '
  'Money never leaves the system. Lock order: player, then game.';
