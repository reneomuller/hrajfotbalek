-- =============================================================================
-- Migration 33 — the pass money path
--
-- Contract §4.2. This migration touches `create_booking` and `cancel_booking`,
-- which are the two functions Phase 1 proved and the contract otherwise leaves
-- alone. Every one of them is `create or replace` on an IDENTICAL signature:
-- no drop, no new function, nothing for a caller to be pointed at differently.
--
-- WHAT DOES NOT CHANGE, stated first because it is what the suite re-proves:
--
--   * Balance is SUM(delta_czk). No reader filters on `expires_at`.
--   * The ledger never goes negative, per player or per batch.
--   * The player advisory lock is still taken before the balance is read, and
--     it is still what makes double-spend impossible across two concurrent
--     bookings by one player.
--   * Lock order is player, then game. Unchanged, and not reordered.
--   * Capacity is still the sole booking limit, counted under the game lock.
--
-- WHAT CHANGES is only WHICH ROWS a spend is written against: one negative row
-- per batch consumed, soonest-expiring first, then the ordinary pool. The
-- TOTAL applied is identical to what the previous version would have applied,
-- because the batches and the pool together sum to exactly the balance.
--
-- Rollback: supabase/rollback/20260802160000_pass_money_path_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- apply_credit — the allocator, in one place
--
-- SOONEST-EXPIRING FIRST (§4.2). Otherwise a player holding both a pass and
-- ordinary credit watches the pass expire while the permanent credit is spent,
-- which is the opposite of what they bought.
--
-- ALREADY-EXPIRED BATCHES ARE STILL SPENT FROM, and that is deliberate rather
-- than an oversight. They still count toward `SUM(delta_czk)` until the sweep
-- runs, so skipping them would leave a player with a balance the booking path
-- refuses to use — money visible on the account page that cannot buy a game.
-- The ruling accepted this window explicitly; it is bounded by the cron
-- interval and errs in the player's favour.
--
-- Returns how much was applied. The caller decides what that means.
-- -----------------------------------------------------------------------------

create function public.apply_credit(
  p_player_id  uuid,
  p_booking_id uuid,
  p_wanted_czk integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need    integer := greatest(0, coalesce(p_wanted_czk, 0));
  v_applied integer := 0;
  v_take    integer;
  v_batch   record;
  v_pool    integer;
begin
  if v_need = 0 then
    return 0;
  end if;

  -- Batches first, soonest expiry first. `credit_batches` already orders them.
  for v_batch in
    select * from public.credit_batches(p_player_id)
  loop
    exit when v_need = 0;
    continue when v_batch.remaining_czk <= 0;

    v_take := least(v_need, v_batch.remaining_czk);

    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
    values (p_player_id, -v_take, 'redemption', p_booking_id, v_batch.batch_id);

    v_applied := v_applied + v_take;
    v_need    := v_need - v_take;
  end loop;

  -- Then the ordinary pool: everything that is neither a batch row nor linked
  -- to one. This is the pre-Phase-20a world, and it is still most of the
  -- ledger.
  if v_need > 0 then
    select coalesce(sum(cl.delta_czk), 0)::integer into v_pool
      from public.credit_ledger cl
     where cl.player_id = p_player_id
       and cl.expires_at is null
       and cl.batch_id is null;

    v_take := least(v_need, greatest(v_pool, 0));
    if v_take > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (p_player_id, -v_take, 'redemption', p_booking_id);
      v_applied := v_applied + v_take;
    end if;
  end if;

  return v_applied;
end $$;

revoke execute on function public.apply_credit(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_credit(uuid, uuid, integer) to service_role;

comment on function public.apply_credit(uuid, uuid, integer) is
  'Spends credit soonest-expiring-first, one negative row per batch consumed. '
  'Called only from create_booking, under the player advisory lock. Not '
  'callable by a session: it writes ledger rows and takes a player id.';

-- =============================================================================
-- create_booking_internal — same signature, same locks, batch-aware spend
--
-- THE SHARED BODY, not the wrapper. `create_booking` and `admin_create_booking`
-- are thin authorization shells around this function; the money logic, the
-- locks and the waitlist conversion all live here. Replacing the wrapper would
-- have changed nothing about how credit is spent — and writing a NEW function
-- with a guessed signature, as a first attempt here did, creates an overload
-- that leaves the real path untouched and every call ambiguous.
--
-- Reproduced from migration 4 with exactly one block changed, marked below.
-- =============================================================================

create or replace function public.create_booking_internal(
  p_game_id          uuid,
  p_player_id        uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid,
  p_booked_by_admin  boolean
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game            public.games%rowtype;
  v_player          public.players%rowtype;
  v_active_count    integer;
  v_balance         integer;
  v_price           integer;
  v_credit_applied  integer;
  v_amount_due      integer;
  v_method          public.payment_method;
  v_status          public.booking_status;
  v_payment_code    bigint;
  v_booking_id      uuid;
  v_waitlist        public.waitlist%rowtype;
  v_result          public.booking_result;
begin
  -- The narrowed client domain. `credit` and `seed_free` are OUTCOMES this
  -- function derives, never inputs a caller may assert — widening this would
  -- let any caller book itself free, and no later check undoes that as safely
  -- as never accepting the value. Rejected, never silently downgraded to 'qr':
  -- a silent downgrade would mask a client that believes it can name the method.
  if p_payment_method is null or p_payment_method not in ('qr', 'cash') then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'payment_method must be qr or cash; credit and seed_free are derived';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_player from public.players p where p.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- Only a live game accepts bookings. draft is not public yet; played,
  -- settled and cancelled are terminal.
  if v_game.status not in ('published', 'full') then
    raise exception 'GAME_NOT_BOOKABLE'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  if v_game.starts_at <= now() then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  -- One active booking per player per game. The partial unique index is the
  -- backstop behind this check, not the primary mechanism.
  if exists (
    select 1 from public.bookings b
     where b.game_id = p_game_id
       and b.player_id = p_player_id
       and b.status in ('reserved', 'confirmed')
  ) then
    raise exception 'DUPLICATE_ACTIVE_BOOKING';
  end if;

  -- Capacity, counted under the game lock.
  select count(*) into v_active_count
    from public.bookings b
   where b.game_id = p_game_id
     and b.status in ('reserved', 'confirmed');

  if v_active_count >= v_game.capacity then
    raise exception 'CAPACITY_FULL';
  end if;

  v_price := v_game.price_czk;

  -- --- derive the payment method -------------------------------------------
  -- Precedence: is_seed -> seed_free; full balance -> credit; else the
  -- caller's qr/cash choice with partial credit applied.

  if v_player.is_seed then
    v_method         := 'seed_free';
    v_price          := 0;
    v_credit_applied := 0;
    v_amount_due     := 0;
    v_payment_code   := null;
    v_status         := 'confirmed';
  else
    -- Balance re-read under the PLAYER lock. This is the line that makes
    -- double-spend impossible across two concurrent bookings by one player.
    select coalesce(sum(cl.delta_czk), 0) into v_balance
      from public.credit_ledger cl
     where cl.player_id = p_player_id;

    v_credit_applied := least(greatest(v_balance, 0), v_price);
    v_amount_due     := v_price - v_credit_applied;

    -- Explicit non-negativity guard. `least()` above already guarantees it,
    -- but the invariant is stated rather than implied: if a future edit
    -- changes the arithmetic, this raises instead of silently writing a
    -- redemption that drives SUM(delta_czk) below zero.
    if v_balance - v_credit_applied < 0 then
      raise exception 'CREDIT_NEGATIVE_BLOCKED';
    end if;

    if v_credit_applied = v_price and v_price > 0 then
      v_method := 'credit';
    else
      v_method := p_payment_method;
    end if;

    if v_amount_due = 0 then
      -- Fully covered (or a free game): nothing to pay, so nothing to chase.
      v_status       := 'confirmed';
      v_payment_code := null;
    else
      v_status := 'reserved';
      -- Only QR bookings carry a variable symbol.
      if v_method = 'qr' then
        v_payment_code := public.next_payment_code();
      else
        v_payment_code := null;
      end if;
    end if;
  end if;

  -- --- write state ----------------------------------------------------------

  insert into public.bookings (
    game_id, player_id, status, payment_method, payment_code,
    price_czk, credit_applied_czk, is_seed, booked_by_admin
  ) values (
    p_game_id, p_player_id, v_status, v_method, v_payment_code,
    v_price, v_credit_applied, v_player.is_seed, p_booked_by_admin
  ) returning id into v_booking_id;

  -- --- ledger ---------------------------------------------------------------

  -- THE ONE BEHAVIOURAL CHANGE IN THIS FUNCTION (Phase 20a, §4.2).
  --
  -- Phase 1 wrote a single negative row. This writes one per BATCH consumed,
  -- soonest-expiring first, then one against the ordinary pool. The TOTAL is
  -- identical — the allocator is asked for exactly `v_credit_applied`, which
  -- was computed from the same balance a line above — and the guard below says
  -- so rather than trusting it.
  --
  -- Everything around it is untouched: the same locks in the same order, the
  -- same balance read, the same non-negativity guard, the same capacity check.
  if v_credit_applied > 0 then
    if public.apply_credit(p_player_id, v_booking_id, v_credit_applied) <> v_credit_applied then
      -- Unreachable unless the batches and the ordinary pool no longer sum to
      -- the balance, which would mean a ledger row is none of the three shapes
      -- migration 32 defines. Raising aborts the transaction, taking the
      -- booking and every ledger row with it.
      raise exception 'CREDIT_ALLOCATION_MISMATCH'
        using detail = 'batch allocation did not cover the applied credit';
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_redeemed', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('amount_czk', v_credit_applied), v_game.city, v_game.brand);
  end if;

  -- --- events (same transaction as the state change, always) ----------------

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_created', p_player_id, p_game_id, v_booking_id,
          jsonb_build_object(
            'payment_method', v_method,
            'price_czk', v_price,
            'credit_applied_czk', v_credit_applied,
            'amount_due_czk', v_amount_due,
            'booked_by_admin', p_booked_by_admin),
          v_game.city, v_game.brand);

  if v_status = 'confirmed' then
    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('payment_confirmed', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('method', v_method, 'amount_czk', 0),
            v_game.city, v_game.brand);
  end if;

  -- --- waitlist conversion --------------------------------------------------

  if p_from_waitlist_id is not null then
    select * into v_waitlist from public.waitlist w where w.id = p_from_waitlist_id;
    if not found then
      raise exception 'WAITLIST_ENTRY_NOT_FOUND';
    end if;
    -- The entry must belong to this player and this game. Without this a
    -- caller could convert somebody else's waitlist entry into their booking.
    if v_waitlist.player_id <> p_player_id or v_waitlist.game_id <> p_game_id then
      raise exception 'INSUFFICIENT_PERMISSION'
        using detail = 'waitlist entry does not belong to this player and game';
    end if;

    update public.waitlist
       set converted_booking_id = v_booking_id
     where id = p_from_waitlist_id;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('waitlist_converted', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('waitlist_id', p_from_waitlist_id),
            v_game.city, v_game.brand);
  end if;

  -- published -> full if this booking took the last spot.
  perform public.sync_game_fullness(p_game_id);

  v_result := (v_booking_id, v_status, v_method, v_payment_code,
               v_price, v_credit_applied, v_amount_due)::public.booking_result;
  return v_result;
end;
$$;

-- The shared body must never be callable directly: it performs no
-- authorization of its own.

-- =============================================================================
-- cancel_booking — refunds return to the batch they came from
--
-- §4.2: "A cancellation refund returns to the batch it came from, with that
-- batch's original expiry. Refunding pass credit as never-expiring credit
-- would turn a booking-and-cancelling loop into a way to launder an expiry
-- away."
--
-- The refund MIRRORS the redemption rows this booking wrote, which is the only
-- way to get that right when a spend crossed two batches. The cash/QR portion
-- of a confirmed booking becomes ordinary unexpiring credit, unchanged.
-- =============================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
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
  v_redemption  record;
  v_refunded    integer := 0;
  v_unexpiring  integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'cancel_booking cancels only the calling player''s own booking';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(v_booking.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'CANCEL_WINDOW_CLOSED'
      using detail = 'game status ' || v_game.status::text || ', starts_at ' || v_game.starts_at::text;
  end if;

  v_lead_hours := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  -- --- credit for money ACTUALLY APPLIED (unchanged) --------------------------
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
    -- Mirror every redemption this booking wrote, back to the batch it drew
    -- from, carrying that batch's original expiry. A spend that crossed two
    -- batches refunds to both, in the amounts it took from each.
    for v_redemption in
      select cl.batch_id, -cl.delta_czk as amount_czk, b.expires_at
        from public.credit_ledger cl
        join public.credit_ledger b on b.id = cl.batch_id
       where cl.booking_id = p_booking_id
         and cl.reason = 'redemption'
         and cl.batch_id is not null
    loop
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
      values (v_booking.player_id, v_redemption.amount_czk, 'cancellation_credit',
              p_booking_id, v_redemption.batch_id);
      v_refunded := v_refunded + v_redemption.amount_czk;
    end loop;

    -- Whatever is left is credit that came from the ordinary pool, plus the
    -- cash or QR the player actually paid on a confirmed booking. Both are
    -- unexpiring, which is Phase 1 behaviour unchanged.
    v_unexpiring := v_credit - v_refunded;
    if v_unexpiring > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id, v_unexpiring, 'cancellation_credit', p_booking_id);
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'amount_czk', v_credit,
              'reason', 'cancellation_credit',
              'returned_to_batches_czk', v_refunded),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_cancelled', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'previous_status', v_booking.status),
          v_game.city, v_game.brand);

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('previous_status', v_booking.status),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id, 'cancelled'::public.booking_status, v_credit, v_lead_hours)::public.cancel_result;
end $$;

-- =============================================================================
-- create_pass_topup — a SEPARATE function, not an overload of create_topup
--
-- CAUGHT BEFORE IT SHIPPED, and it is the exact trap migration 28 documents.
-- The obvious move is to add `p_pass_games integer default null` to
-- `create_topup`. That does not replace the migration-25 function — it creates
-- a SECOND one — and Postgres then refuses every one-argument call with
-- "function public.create_topup(integer) is not unique". PostgREST calls by
-- name, so the failure lands at runtime on the existing top-up form, not here.
--
-- Verified rather than assumed: with both defined, `create_topup(300)` and
-- `create_topup(p_amount_czk => 300)` both raised. Hence a distinct name.
--
-- A pass is a top-up with a KNOWN amount, so the amount is taken from the tier
-- rather than from the caller. That is what stops a crafted call requesting the
-- 20-pass at the 1-pass price.
-- =============================================================================

create function public.create_pass_topup(p_pass_games integer)
returns public.credit_topups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_row       public.credit_topups;
  v_tier      public.pass_tiers;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  select * into v_tier from public.pass_tiers where games = p_pass_games;
  if not found then
    raise exception 'PASS_TIER_NOT_FOUND';
  end if;

  -- The same 50–2000 bounds the ordinary path enforces. A tier priced outside
  -- them would be a tier nobody could pay for, and the check belongs where the
  -- row is written rather than only in the table's constraints.
  if v_tier.price_czk < 50 or v_tier.price_czk > 2000 then
    raise exception 'AMOUNT_OUT_OF_RANGE'
      using detail = 'top-ups are between 50 and 2000 CZK';
  end if;

  insert into public.credit_topups (player_id, amount_czk, payment_code, pass_games)
  values (v_player_id, v_tier.price_czk, public.next_topup_code(), v_tier.games)
  returning * into v_row;

  insert into public.events (event_type, player_id, metadata, city, brand, policy_version)
  values ('topup_requested', v_player_id,
          jsonb_build_object(
            'topup_id', v_row.id,
            'amount_czk', v_row.amount_czk,
            'payment_code', v_row.payment_code,
            'pass_games', v_tier.games),
          v_row.city, v_row.brand, v_row.policy_version);

  return v_row;
end $$;

revoke execute on function public.create_pass_topup(integer) from public, anon;
grant execute on function public.create_pass_topup(integer) to authenticated, service_role;

comment on function public.create_pass_topup(integer) is
  'Requests a pass at a tier''s own price. A SEPARATE function rather than a '
  'defaulted parameter on create_topup, which would have created an ambiguous '
  'overload that breaks every existing one-argument call at runtime.';

-- =============================================================================
-- confirm_topup — THE ONE EXCEPTION TO CREDITED-EQUALS-RECEIVED
--
-- §4.1 states the credited amount is always the amount received, because a
-- top-up has no price to be short of. A PASS DOES HAVE A PRICE, so:
--
--   * a received amount that EXACTLY equals a pass price credits the pass
--     VALUE, as a batch carrying its expiry;
--   * any other amount falls back to the standing rule — credited = received,
--     no expiry, no discount.
--
-- The match is on the exact figure because it is the only signal that
-- distinguishes "bought the 5-pass" from "sent some money". A player who sends
-- 690 against a 700 pass has made a top-up, and telling them otherwise would
-- either give away 60 CZK or silently swallow 690.
-- =============================================================================

create or replace function public.confirm_topup(
  p_topup_id            uuid,
  p_confirmed_by        uuid default null,
  p_received_amount_czk integer default null
)
returns public.topup_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup      public.credit_topups;
  v_actor      uuid;
  v_received   integer;
  v_credited   integer;
  v_balance    integer;
  v_tier       public.pass_tiers;
  v_expires_at timestamptz := null;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin or service role only';
  end if;

  select * into v_topup from public.credit_topups where id = p_topup_id;
  if not found then
    raise exception 'TOPUP_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_topup.player_id::text, 0));

  select * into v_topup from public.credit_topups where id = p_topup_id;
  if v_topup.status <> 'pending' then
    raise exception 'TOPUP_NOT_PENDING'
      using detail = 'status is ' || v_topup.status::text;
  end if;

  -- Null received amount means "credit what was asked for" — the one-tap path.
  v_received := coalesce(p_received_amount_czk, v_topup.amount_czk);
  if v_received <= 0 then
    raise exception 'AMOUNT_OUT_OF_RANGE' using detail = 'received amount must be positive';
  end if;

  v_credited := v_received;

  -- The pass match. An exact hit on a tier price credits that tier's value and
  -- stamps the expiry; anything else leaves `v_credited = v_received` and no
  -- expiry, which is §4.1 unchanged.
  select * into v_tier from public.pass_tiers where price_czk = v_received;
  if found then
    v_credited := v_tier.credited_czk;
    if v_tier.expires_months is not null then
      v_expires_at := now() + make_interval(months => v_tier.expires_months);
    end if;
  end if;

  v_actor := coalesce(p_confirmed_by, public.current_player_id());

  update public.credit_topups
     set status = 'confirmed',
         received_amount_czk = v_received,
         confirmed_by = v_actor,
         confirmed_at = now()
   where id = p_topup_id;

  -- A batch row when the pass expires; an ordinary unexpiring row otherwise.
  insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
  values (v_topup.player_id, v_credited, 'topup', v_expires_at);

  select coalesce(sum(cl.delta_czk), 0) into v_balance
    from public.credit_ledger cl
   where cl.player_id = v_topup.player_id;

  -- ALL THREE NUMBERS ON THE EVENT, because they differ and a receipt showing
  -- only one is the thing a dispute is argued from (§4.2).
  insert into public.events (event_type, player_id, metadata, city, brand, policy_version)
  values ('topup_confirmed', v_topup.player_id,
          jsonb_build_object(
            'topup_id', v_topup.id,
            'received_czk', v_received,
            'credited_czk', v_credited,
            'expires_at', v_expires_at,
            'pass_games', case when v_tier.games is not null then v_tier.games end,
            'confirmed_by', v_actor),
          v_topup.city, v_topup.brand, v_topup.policy_version);

  return (v_topup.id, 'confirmed'::public.topup_status, v_credited, v_balance)::public.topup_result;
end $$;

-- =============================================================================
-- expire_credit_batches — the sweep
--
-- Writes a COMPENSATING NEGATIVE ROW per expired remainder, rather than any
-- reader filtering on `expires_at`. That is the whole reason balance can stay
-- SUM(delta_czk).
--
-- IDEMPOTENT, like every other cron-driven function here: once the remainder
-- is zero there is nothing to write, so a double run is a no-op. That is
-- proven rather than asserted — the second call returns 0.
-- =============================================================================

create function public.expire_credit_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     record;
  v_expired integer := 0;
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'service role only';
  end if;

  for v_row in
    select
      b.id as batch_id,
      b.player_id,
      b.expires_at,
      (b.delta_czk + coalesce((
        select sum(m.delta_czk) from public.credit_ledger m where m.batch_id = b.id
      ), 0))::integer as remaining_czk
    from public.credit_ledger b
    where b.expires_at is not null
      and b.expires_at <= now()
  loop
    continue when v_row.remaining_czk <= 0;

    insert into public.credit_ledger (player_id, delta_czk, reason, batch_id)
    values (v_row.player_id, -v_row.remaining_czk, 'pass_expiry', v_row.batch_id);

    insert into public.events (event_type, player_id, metadata)
    values ('credit_expired', v_row.player_id,
            jsonb_build_object(
              'batch_id', v_row.batch_id,
              'expired_czk', v_row.remaining_czk,
              'expired_at', v_row.expires_at));

    v_expired := v_expired + 1;
  end loop;

  return v_expired;
end $$;

revoke execute on function public.expire_credit_batches() from public, anon, authenticated;
grant execute on function public.expire_credit_batches() to service_role;

comment on function public.expire_credit_batches() is
  'Writes a compensating negative row per expired batch remainder, so balance '
  'stays SUM(delta_czk). Idempotent: once a remainder is zero there is nothing '
  'left to write.';

-- =============================================================================
-- batches_expiring_soon — the three-day heads-up
--
-- Returns the batches to warn about and STAMPS them, in one call, so a cron
-- route that runs twice sends once. Same shape as `mark_nudged`: the marker
-- and the selection are the same statement, because two statements is a race.
-- =============================================================================

create function public.batches_expiring_soon(p_days integer default 3)
returns table (
  batch_id uuid,
  player_id uuid,
  remaining_czk integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'service role only';
  end if;

  return query
  with due as (
    select b.id, b.player_id, b.expires_at,
           (b.delta_czk + coalesce((
             select sum(m.delta_czk) from public.credit_ledger m where m.batch_id = b.id
           ), 0))::integer as remaining
      from public.credit_ledger b
     where b.expires_at is not null
       and b.expiry_notified_at is null
       and b.expires_at > now()
       and b.expires_at <= now() + make_interval(days => p_days)
  ),
  worth_telling as (
    -- Nothing left in the batch is nothing to warn about. Emailing "your 0 CZK
    -- expires on Friday" is worse than silence.
    select * from due where remaining > 0
  ),
  stamped as (
    update public.credit_ledger cl
       set expiry_notified_at = now()
      from worth_telling w
     where cl.id = w.id
    returning cl.id
  )
  select w.id, w.player_id, w.remaining, w.expires_at
    from worth_telling w
   where w.id in (select id from stamped);
end $$;

revoke execute on function public.batches_expiring_soon(integer) from public, anon, authenticated;
grant execute on function public.batches_expiring_soon(integer) to service_role;

comment on function public.batches_expiring_soon(integer) is
  'Batches expiring within p_days that have not been warned about, stamped in '
  'the same statement that selects them — so a cron route that runs twice '
  'sends once.';
