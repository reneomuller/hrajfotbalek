-- =============================================================================
-- Migration 4 — create_booking + the shared internal body
--
-- The highest-risk migration in the plan. Concurrency correctness lives here
-- and cannot be retrofitted: the "same transaction" guarantee for state +
-- ledger + event only holds inside the database, so any transition assembled
-- from separate TypeScript queries is untrustworthy under load.
--
-- LOCK ORDER — PLAYER, THEN GAME. Every function that takes both locks must
-- acquire them in this order. A reversed order anywhere in the codebase opens
-- a deadlock window between two concurrent bookings that share a player and a
-- game in opposite roles. This is stated in every function header that locks.
--
-- Why each lock exists:
--   * game lock   — serialises the capacity count so two callers cannot both
--                   read `count < capacity` for the same last spot.
--   * player lock — serialises the wallet balance re-read so one player's two
--                   concurrent bookings for DIFFERENT games cannot spend the
--                   same credit twice. The game lock cannot help there: the
--                   games differ, so the two transactions never contend on it.
--
-- Rollback: supabase/rollback/20260720110000_rpc_create_booking_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Return contract
-- -----------------------------------------------------------------------------

create type public.booking_result as (
  id uuid,
  status public.booking_status,
  payment_method public.payment_method,
  payment_code bigint,
  price_czk integer,
  credit_applied_czk integer,
  amount_due_czk integer
);

-- -----------------------------------------------------------------------------
-- Authorization helpers
--
-- These read identity from the JWT, never from an argument. `auth.uid()` is
-- the only source of "who is calling" anywhere in this schema.
-- -----------------------------------------------------------------------------

create function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.players p where p.auth_user_id = auth.uid();
$$;

create function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.players p where p.auth_user_id = auth.uid()),
    false);
$$;

-- A service-role context is identified by the JWT claim, NOT by the database
-- role. Inside a SECURITY DEFINER function `current_user` is the function
-- owner, so it says nothing about who called; the claim survives.
create function public.is_service_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    '') = 'service_role';
$$;

-- -----------------------------------------------------------------------------
-- published <-> full is DERIVED state, never something an admin sets.
--
-- Lives in this migration because create_booking is the first caller; Phase 7's
-- cancel_booking / expire_booking / cancel_game reuse it rather than
-- re-deriving the rule.
-- -----------------------------------------------------------------------------

create function public.sync_game_fullness(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_status   public.game_status;
  v_active   integer;
begin
  select g.capacity, g.status into v_capacity, v_status
    from public.games g where g.id = p_game_id;

  -- Only the two live statuses toggle. A played/settled/cancelled game is
  -- terminal and must not be dragged back into circulation by a booking edit.
  if v_status is null or v_status not in ('published', 'full') then
    return;
  end if;

  select count(*) into v_active
    from public.bookings b
   where b.game_id = p_game_id
     and b.status in ('reserved', 'confirmed');

  if v_active >= v_capacity and v_status = 'published' then
    update public.games set status = 'full' where id = p_game_id;
  elsif v_active < v_capacity and v_status = 'full' then
    update public.games set status = 'published' where id = p_game_id;
  end if;
end;
$$;

-- =============================================================================
-- create_booking_internal — the single shared body
--
-- Both entry points (create_booking, admin_create_booking) call this under
-- their OWN authorization check. It performs no authorization itself: by the
-- time it runs, the caller has already been established as either the owning
-- player or an admin/service-role acting on that player's behalf.
--
-- Factored out rather than copy-pasted on purpose. Concurrency correctness
-- that holds in one entry point and not the other is worse than none, because
-- it looks tested.
-- =============================================================================

create function public.create_booking_internal(
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

  if v_credit_applied > 0 then
    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (p_player_id, -v_credit_applied, 'redemption', v_booking_id);

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
revoke execute on function public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean) from public;

-- =============================================================================
-- create_booking — owner-only entry point
--
-- LOCK ORDER: player, then game (inside create_booking_internal).
-- =============================================================================

create function public.create_booking(
  p_game_id          uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid default null,
  p_player_id        uuid default null
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  v_player_id := public.current_player_id();

  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  -- p_player_id exists ONLY to be rejected. The contract takes identity from
  -- auth.uid(); this argument gives a caller that believes it can name a
  -- player an explicit, testable refusal rather than silent success under its
  -- own identity, which would look like it worked.
  if p_player_id is not null and p_player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'create_booking books only for the calling player';
  end if;

  return public.create_booking_internal(
    p_game_id, v_player_id, p_payment_method, p_from_waitlist_id, false);
end;
$$;

revoke execute on function public.create_booking(uuid, public.payment_method, uuid, uuid) from public;
grant execute on function public.create_booking(uuid, public.payment_method, uuid, uuid) to authenticated, service_role;

comment on function public.create_booking(uuid, public.payment_method, uuid, uuid) is
  'Owner-only booking entry point. Identity comes from auth.uid(); p_player_id '
  'is accepted only to be rejected when it names anyone else. Accepts qr|cash '
  'only — credit and seed_free are derived. Lock order: player, then game.';
