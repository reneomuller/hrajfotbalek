-- =============================================================================
-- Migration 7 — confirm_booking, expire_booking, and the game transitions
--
-- confirm_booking is the SINGLE AUTOMATION SEAM. It takes confirmed_by and
-- received_amount_czk and is deliberately indifferent to whether the caller is
-- a human tapping "✓ Paid" in the admin panel or a future Fio bank poller. The
-- admin UI omits the amount (confirm at the expected value); a bank poller
-- passes what the bank actually reported. Getting this boundary right now means
-- future bank automation is a NEW CALLER, not a refactor.
--
-- LOCKING NOTE — why these functions take the game lock but not the player lock:
--
-- The player lock exists to serialise a balance RE-READ before writing a
-- NEGATIVE ledger delta, so concurrent bookings cannot overspend a wallet.
-- Every ledger write in this migration is POSITIVE (overpayment credit,
-- cancellation credit, returned credit on expiry). A positive delta cannot
-- drive SUM(delta_czk) below zero, so no re-read needs protecting. A concurrent
-- create_booking may read a balance that does not yet include the new credit —
-- stale, but safe: the player simply gets less credit applied than they might.
--
-- This is not a shortcut, it is the thing that prevents a deadlock. cancel_game
-- discovers its player set only by reading the game's bookings, so taking
-- player locks there would force a game-then-player order — the exact reverse
-- of create_booking's player-then-game — and the two would deadlock under
-- load. Taking only the game lock is a subset of the global order and is
-- therefore always safe.
--
-- Rollback: supabase/rollback/20260720130000_booking_rpcs_b_down.sql
-- =============================================================================

create type public.confirm_result as (
  id uuid,
  status public.booking_status,
  credit_issued_czk integer
);

-- -----------------------------------------------------------------------------
-- confirm_booking
-- -----------------------------------------------------------------------------

create function public.confirm_booking(
  p_booking_id         uuid,
  p_confirmed_by       uuid default null,
  p_received_amount_czk integer default null
)
returns public.confirm_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking    public.bookings%rowtype;
  v_game       public.games%rowtype;
  v_amount_due integer;
  v_credit     integer := 0;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'confirm_booking requires an admin session or service role';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  v_amount_due := v_booking.price_czk - v_booking.credit_applied_czk;

  -- === payment landing AFTER expiry ==========================================
  -- Credited in full to the wallet; the booking stays expired and the spot is
  -- NEVER reinstated. Do not "helpfully" add reinstatement here: the spot has
  -- almost certainly been taken by someone else, and capacity must not move.
  if v_booking.status = 'expired' then
    v_credit := coalesce(p_received_amount_czk, 0);

    if v_credit > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id, v_credit, 'adjustment', p_booking_id);

      insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
      values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
              jsonb_build_object('amount_czk', v_credit, 'reason', 'payment_after_expiry',
                                 'confirmed_by', p_confirmed_by),
              v_game.city, v_game.brand);
    end if;

    return (p_booking_id, 'expired'::public.booking_status, v_credit)::public.confirm_result;
  end if;

  -- Only a reserved booking can be confirmed.
  if v_booking.status <> 'reserved' then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  -- === underpayment ==========================================================
  -- A partial payment is not a payment. Leave the booking reserved, emit no
  -- payment_confirmed, and raise so the admin follows up by hand. The raise
  -- rolls the transaction back, which is why no payment_unmatched event is
  -- written here — it could not survive.
  if p_received_amount_czk is not null and p_received_amount_czk < v_amount_due then
    raise exception 'PAYMENT_UNDERPAID'
      using detail = 'received ' || p_received_amount_czk::text || ' of ' || v_amount_due::text;
  end if;

  -- === overpayment ===========================================================
  if p_received_amount_czk is not null and p_received_amount_czk > v_amount_due then
    v_credit := p_received_amount_czk - v_amount_due;

    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'adjustment', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object('amount_czk', v_credit, 'reason', 'overpayment',
                               'confirmed_by', p_confirmed_by),
            v_game.city, v_game.brand);
  end if;

  update public.bookings set status = 'confirmed' where id = p_booking_id;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('payment_confirmed', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'amount_czk', coalesce(p_received_amount_czk, v_amount_due),
            'expected_czk', v_amount_due,
            'confirmed_by', p_confirmed_by,
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  return (p_booking_id, 'confirmed'::public.booking_status, v_credit)::public.confirm_result;
end;
$$;

revoke execute on function public.confirm_booking(uuid, uuid, integer) from public;
grant execute on function public.confirm_booking(uuid, uuid, integer) to authenticated, service_role;

comment on function public.confirm_booking(uuid, uuid, integer) is
  'The single automation seam for payment confirmation. Admin UI passes NULL '
  'for received_amount_czk (confirm at expected); a future bank poller passes '
  'the bank-reported amount. Over -> confirm + credit the difference. Under -> '
  'refuse, booking stays reserved. After expiry -> credit in full, never '
  'reinstate the spot.';

-- -----------------------------------------------------------------------------
-- expire_booking
-- -----------------------------------------------------------------------------

create function public.expire_booking(p_booking_id uuid)
returns public.confirm_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_credit  integer := 0;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'expire_booking requires an admin session or service role';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  if v_booking.status <> 'reserved' then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  update public.bookings set status = 'expired' where id = p_booking_id;

  -- JUDGMENT CALL, flagged for review: credit that was already APPLIED to this
  -- booking is returned to the wallet on expiry.
  --
  -- The spec text for expire_booking lists only booking_expired + spot_released
  -- and is silent on applied credit. Staying literally silent would mean a
  -- player who part-paid with wallet credit and then let the reservation lapse
  -- loses that credit outright, with no event explaining where it went — money
  -- leaving the system through the back door, which is the one thing this
  -- design forbids. The amount is returned as a positive ledger row so the
  -- wallet stays a derivable SUM.
  if v_booking.credit_applied_czk > 0 then
    v_credit := v_booking.credit_applied_czk;

    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'adjustment', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object('amount_czk', v_credit, 'reason', 'credit_returned_on_expiry'),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_expired', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('credit_returned_czk', v_credit), v_game.city, v_game.brand);

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('source', 'expiry_sweep'), v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id, 'expired'::public.booking_status, v_credit)::public.confirm_result;
end;
$$;

revoke execute on function public.expire_booking(uuid) from public;
grant execute on function public.expire_booking(uuid) to authenticated, service_role;

comment on function public.expire_booking(uuid) is
  'Admin-or-cron expiry. An expired booking is NEVER reinstated — a payment '
  'landing afterwards is credited in full by confirm_booking instead.';

-- =============================================================================
-- Game transitions
-- =============================================================================

create function public.publish_game(p_game_id uuid)
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

  -- Games are NEVER auto-published. Publication is always an explicit admin
  -- action, which is why there is no code path that reaches this from a sweep.
  if v_game.status <> 'draft' then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  update public.games set status = 'published' where id = p_game_id;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('game_published', p_game_id,
          jsonb_build_object('capacity', v_game.capacity, 'price_czk', v_game.price_czk),
          v_game.city, v_game.brand);

  -- A game published with bookings already on it (admin pre-fill) may be full
  -- on arrival.
  perform public.sync_game_fullness(p_game_id);

  return (select status from public.games where id = p_game_id);
end;
$$;

-- `played` is reachable from published OR full, so an under-capacity game that
-- never filled can still be played and settled.
--
-- No event is emitted for this transition: the Phase 3 catalog defines 22
-- event types and has no game_played among them. Adding a 23rd would mean
-- editing an applied migration's CHECK constraint, which is out of scope here.
-- The transition remains fully visible in games.status, and settle emits
-- game_settled.
create function public.mark_game_played(p_game_id uuid)
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

  if v_game.status not in ('published', 'full') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  update public.games set status = 'played' where id = p_game_id;
  return 'played';
end;
$$;

create function public.settle_game(p_game_id uuid)
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

-- -----------------------------------------------------------------------------
-- cancel_game — the fan-out, in ONE transaction
--
-- A mid-loop failure must not be able to leave some players credited and
-- others not, which is the whole reason this is a single plpgsql function
-- rather than an admin-panel loop issuing one RPC per booking.
-- -----------------------------------------------------------------------------

create function public.cancel_game(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game    public.games%rowtype;
  v_booking public.bookings%rowtype;
  v_credit  integer;
  v_count   integer := 0;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  -- Game lock only — see the locking note in this migration's header.
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  if v_game.status not in ('draft', 'published', 'full') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  for v_booking in
    select * from public.bookings b
     where b.game_id = p_game_id and b.status in ('reserved', 'confirmed')
  loop
    -- Same credit rule as cancel_booking: a confirmed booking is fully
    -- accounted for; a reserved one returns only the credit already applied.
    if v_booking.status = 'confirmed' then
      v_credit := v_booking.price_czk;
    else
      v_credit := v_booking.credit_applied_czk;
    end if;

    update public.bookings
       set status = 'cancelled',
           cancel_lead_hours = round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2)
     where id = v_booking.id;

    if v_credit > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id, v_credit, 'cancellation_credit', v_booking.id);

      insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
      values ('credit_issued', v_booking.player_id, p_game_id, v_booking.id,
              jsonb_build_object('amount_czk', v_credit, 'reason', 'game_cancelled'),
              v_game.city, v_game.brand);
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('booking_cancelled', v_booking.player_id, p_game_id, v_booking.id,
            jsonb_build_object('credit_issued_czk', v_credit, 'source', 'game_cancelled'),
            v_game.city, v_game.brand);

    v_count := v_count + 1;
  end loop;

  -- No spot_released here: a cancelled game has no spots to release.

  -- Clear the waitlist. Nobody is waiting for a game that will not happen, and
  -- leaving rows behind would have the Phase 19 notify sweep mailing them.
  delete from public.waitlist where game_id = p_game_id;

  update public.games set status = 'cancelled' where id = p_game_id;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('game_cancelled', p_game_id,
          jsonb_build_object('bookings_cancelled', v_count), v_game.city, v_game.brand);

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_game_capacity — capacity may never drop below the active-booking count
-- -----------------------------------------------------------------------------

create function public.set_game_capacity(p_game_id uuid, p_capacity integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_active integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  if p_capacity is null or p_capacity < 1 then
    raise exception 'INVALID_CAPACITY';
  end if;

  select count(*) into v_active
    from public.bookings b
   where b.game_id = p_game_id and b.status in ('reserved', 'confirmed');

  -- Lowering capacity below the people already booked would silently
  -- oversubscribe the game; there is no sanctioned way to un-book someone as a
  -- side effect of an edit.
  if p_capacity < v_active then
    raise exception 'CAPACITY_BELOW_ACTIVE_BOOKINGS'
      using detail = 'active bookings: ' || v_active::text;
  end if;

  update public.games set capacity = p_capacity where id = p_game_id;
  perform public.sync_game_fullness(p_game_id);

  return p_capacity;
end;
$$;

revoke execute on function public.publish_game(uuid) from public;
revoke execute on function public.mark_game_played(uuid) from public;
revoke execute on function public.settle_game(uuid) from public;
revoke execute on function public.cancel_game(uuid) from public;
revoke execute on function public.set_game_capacity(uuid, integer) from public;

grant execute on function public.publish_game(uuid) to authenticated, service_role;
grant execute on function public.mark_game_played(uuid) to authenticated, service_role;
grant execute on function public.settle_game(uuid) to authenticated, service_role;
grant execute on function public.cancel_game(uuid) to authenticated, service_role;
grant execute on function public.set_game_capacity(uuid, integer) to authenticated, service_role;
