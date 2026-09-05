-- =============================================================================
-- Round 26 item 1 — PAY FIRST. The booking is created by the payment.
--
-- THE INVERSION, AND WHY THE OLD SHAPE HAD TO GO.
--
-- Until now: choosing "Online payment" created a `reserved` booking, stamped
-- `payment_pending_at`, and held the seat for thirty minutes while the player
-- was on the payment form. The webhook then confirmed it. Everything that went
-- wrong with that came from the same place — A SEAT WAS HELD BY SOMEBODY WHO
-- HAD NOT PAID:
--
--   * the roster published their name as a participant (round 25 item 1)
--   * the row lingered `reserved` forever and blocked `settle_game` (row 183)
--   * the count went down for a shopper, so a real buyer saw a fuller game
--     than existed
--   * and every one of those needed its own machinery to paper over
--
-- The owner's ruling removes the cause instead of the symptoms: **no booking
-- row exists until money has arrived.** The Stripe session carries the game,
-- the player and the party size in its metadata; the WEBHOOK creates the
-- booking, and capacity is checked at that instant under the game's lock.
--
-- WHAT HAPPENS WHEN THE GAME FILLED WHILE THEY WERE PAYING. Nothing is
-- oversold and nobody loses money:
--
--   1. ACTIVE EXPIRY IS THE PRIMARY DEFENCE. The moment a game reaches full by
--      ANY rail — this webhook, a credit redemption, an admin adding somebody —
--      every other open checkout for that game is expired at Stripe. A later
--      payer's form dies as "session expired" BEFORE money moves. That is the
--      case the design optimises for, and it is the one that will happen.
--
--   2. THE CREDIT PATH IS THE SAME-INSTANT RESIDUAL, not the plan. Two people
--      can complete inside the same lock window; the advisory lock serialises
--      them and the second finds no seat. They get the full amount as CREDIT —
--      the refund-in-kind law (ruling O), which is the only refund path this
--      product has — plus a notification in their own language explaining it,
--      plus an entry in the admin's needs-attention queue so a human knows it
--      happened.
--
-- SEAT COUNTS NEVER DECREMENT FOR SHOPPERS. That falls out of the design
-- rather than being enforced: there is no row to count until there is money.
--
-- Rollback: supabase/rollback/20260906100000_pay_first_booking_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The open-checkout register
--
-- WHY A TABLE AT ALL, when the session lives at Stripe: because ACTIVE EXPIRY
-- needs to answer "which sessions are open for this game" from inside our own
-- transaction, at the moment a booking is created. Asking Stripe would be a
-- network call under an advisory lock, which is how a lock becomes an outage.
--
-- It is a REGISTER, not a booking. It holds no seat, appears on no roster, and
-- is counted by nothing.
-- -----------------------------------------------------------------------------
create table if not exists public.checkout_sessions (
  id                uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  game_id           uuid not null references public.games(id) on delete cascade,
  player_id         uuid not null references public.players(id) on delete cascade,
  guest_count       integer not null default 0 check (guest_count >= 0),
  amount_czk        integer not null check (amount_czk > 0),
  /*
   * open      — the form is on somebody's screen
   * booked    — paid, and a seat was there
   * credited  — paid, and the game had filled: the money became credit
   * expired   — killed by active expiry, or abandoned
   */
  status            text not null default 'open'
                    check (status in ('open', 'booked', 'credited', 'expired')),
  booking_id        uuid references public.bookings(id) on delete set null,
  attention_at      timestamptz,
  attention_reason  text,
  created_at        timestamptz not null default now(),
  settled_at        timestamptz
);

create index if not exists checkout_sessions_open_idx
  on public.checkout_sessions (game_id) where status = 'open';
create index if not exists checkout_sessions_attention_idx
  on public.checkout_sessions (attention_at desc) where attention_at is not null;

alter table public.checkout_sessions enable row level security;

/*
 * NO CLIENT READS THIS TABLE. Every access is through a SECURITY DEFINER
 * function, and RLS with no policy denies everything — which is the correct
 * posture for a table that names who is trying to buy what.
 */
grant select, insert, update on public.checkout_sessions to service_role;

comment on table public.checkout_sessions is
  'Open Stripe checkouts, so a game that fills can actively expire the rest. '
  'Holds no seat and is counted by nothing: a booking exists only once money '
  'has arrived.';

-- -----------------------------------------------------------------------------
-- 2. open_checkout — called when the form is put on screen
-- -----------------------------------------------------------------------------
create or replace function public.open_checkout(
  p_game_id           uuid,
  p_guest_count       integer,
  p_stripe_session_id text,
  p_amount_czk        integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
  v_id     uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  insert into public.checkout_sessions
         (stripe_session_id, game_id, player_id, guest_count, amount_czk)
       values (p_stripe_session_id, p_game_id, v_player,
               greatest(0, coalesce(p_guest_count, 0)), p_amount_czk)
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.open_checkout(uuid, integer, text, integer) from public;
grant execute on function public.open_checkout(uuid, integer, text, integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. settle_checkout_session — the webhook's entry point, and where the
--    booking is born
-- -----------------------------------------------------------------------------
create or replace function public.settle_checkout_session(
  p_stripe_session_id text,
  p_amount_czk        integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.checkout_sessions%rowtype;
  v_game    public.games%rowtype;
  v_seats   integer;
  v_wanted  integer;
  v_booking uuid;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'settle_checkout_session is called by the webhook';
  end if;

  select * into v_session
    from public.checkout_sessions
   where stripe_session_id = p_stripe_session_id;

  if not found then
    -- A session this product did not open. Stripe test events and old Payment
    -- Links both land here; the route answers 200 and logs.
    return 'unknown';
  end if;

  -- REDELIVERY IS A NO-OP. Stripe is at-least-once and a second webhook for a
  -- settled session must not create a second booking.
  if v_session.status <> 'open' then
    return 'already';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Same as `cancel_booking`. ===
  perform pg_advisory_xact_lock(hashtextextended(v_session.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_session.game_id::text, 0));

  -- Re-read under the lock: another payer may have settled between the read
  -- above and here, which is the whole race this function exists to decide.
  select * into v_session
    from public.checkout_sessions where id = v_session.id;
  if v_session.status <> 'open' then
    return 'already';
  end if;

  select * into v_game from public.games g where g.id = v_session.game_id;

  v_wanted := 1 + v_session.guest_count;
  v_seats  := public.game_seats_taken(v_session.game_id);

  /*
   * IS THERE STILL ROOM. The game must also still be BOOKABLE — a cancelled
   * game takes the same path as a full one, because in both cases the player
   * paid for something they cannot have.
   */
  if v_game.status in ('published', 'full')
     and v_seats + v_wanted <= v_game.capacity then

    insert into public.bookings
           (game_id, player_id, status, payment_method, price_czk,
            credit_applied_czk, guest_count, stripe_session_id)
         values (v_session.game_id, v_session.player_id, 'confirmed', 'qr',
                 v_session.amount_czk, 0, v_session.guest_count,
                 p_stripe_session_id)
      returning id into v_booking;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('booking_created', v_session.player_id, v_session.game_id, v_booking,
            jsonb_build_object('seats', v_wanted, 'paid_czk', p_amount_czk,
                               'rail', 'checkout'),
            v_game.city, v_game.brand);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('payment_confirmed', v_session.player_id, v_session.game_id, v_booking,
            jsonb_build_object('amount_czk', p_amount_czk,
                               'session', p_stripe_session_id),
            v_game.city, v_game.brand);

    update public.checkout_sessions
       set status = 'booked', booking_id = v_booking, settled_at = now()
     where id = v_session.id;

    perform public.sync_game_fullness(v_session.game_id);
    return 'booked';
  end if;

  /*
   * NO SEAT. THE MONEY BECOMES CREDIT, IN FULL.
   *
   * Ruling O's refund-in-kind law, and the only refund path this product has:
   * `refundAs` is `credit` and there is no cash-out anywhere. The player is not
   * out of pocket — they hold the value — and the notification says so.
   *
   * UNEXPIRING, deliberately. A pass batch expires because it was bought at a
   * discount; this is money that arrived for a seat the product could not
   * deliver, and putting a clock on it would make our race the player's
   * problem.
   */
  insert into public.credit_ledger (player_id, delta_czk, reason)
       values (v_session.player_id, p_amount_czk, 'cancellation_credit');

  insert into public.events (event_type, player_id, game_id, metadata, city, brand)
  values ('credit_issued', v_session.player_id, v_session.game_id,
          jsonb_build_object('amount_czk', p_amount_czk,
                             'reason', 'checkout_game_full',
                             'session', p_stripe_session_id),
          v_game.city, v_game.brand);

  -- The player is told, in their own language, by kind.
  perform public.notify_player(
    v_session.player_id,
    'The game filled while you were paying',
    'Your payment arrived just after the last spot went. The full amount is in '
      || 'your wallet as credit and applies to your next booking automatically.',
    'checkout_game_full',
    null);

  update public.checkout_sessions
     set status           = 'credited',
         settled_at       = now(),
         attention_at     = now(),
         attention_reason = 'paid ' || p_amount_czk::text
                         || ' CZK after the game filled — credited in full',
         booking_id       = null
   where id = v_session.id;

  return 'credited';
end;
$$;

revoke execute on function public.settle_checkout_session(text, integer) from public;
grant execute on function public.settle_checkout_session(text, integer) to service_role;

comment on function public.settle_checkout_session(text, integer) is
  'The webhook creates the booking here, under the game lock, after money has '
  'arrived. A game that filled first pays the money back as credit rather than '
  'overselling the seat.';

-- -----------------------------------------------------------------------------
-- 4. Active expiry — the primary defence
--
-- The DATABASE decides WHICH sessions must die; the APPLICATION kills them at
-- Stripe, because that is a network call and this is a transaction.
-- -----------------------------------------------------------------------------
create or replace function public.checkouts_to_expire(p_game_id uuid)
returns table (stripe_session_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select cs.stripe_session_id
    from public.checkout_sessions cs
    join public.games g on g.id = cs.game_id
   where cs.game_id = p_game_id
     and cs.status = 'open'
     /*
      * FULL, OR NO LONGER TAKING BOOKINGS. Both mean the form on somebody's
      * screen can no longer be honoured, and it is kinder to kill it than to
      * take the money and hand back credit.
      */
     and (g.status not in ('published', 'full')
          or public.game_seats_taken(p_game_id) >= g.capacity);
$$;

revoke execute on function public.checkouts_to_expire(uuid) from public;
grant execute on function public.checkouts_to_expire(uuid) to authenticated, service_role;

create or replace function public.mark_checkout_expired(p_stripe_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  update public.checkout_sessions
     set status = 'expired', settled_at = now()
   where stripe_session_id = p_stripe_session_id
     and status = 'open';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.mark_checkout_expired(text) from public;
grant execute on function public.mark_checkout_expired(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4b. checkout_outcome — what the return page waits on
--
-- OWN-ROW BY CONSTRUCTION. The register denies every client read, so this is
-- the only way in and it filters on `current_player_id()` rather than trusting
-- the session id in the URL — which travels through a cookie and a query
-- string and is therefore the least trustworthy identifier in the flow.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_outcome(p_stripe_session_id text)
returns table (status text, game_id uuid, booking_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select cs.status, cs.game_id, cs.booking_id
    from public.checkout_sessions cs
   where cs.stripe_session_id = p_stripe_session_id
     and cs.player_id = public.current_player_id();
$$;

revoke execute on function public.checkout_outcome(text) from public;
grant execute on function public.checkout_outcome(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. The pending machinery goes
--
-- `booking_holds_seat` loses its thirty-minute clause: a booking is now either
-- live or it is not, because an unpaid one no longer exists. The function stays
-- rather than being dropped — `game_seats_taken`, `game_roster_public` and the
-- admin reads all call it, and one definition of "does this seat count" is the
-- thing worth keeping.
-- -----------------------------------------------------------------------------
create or replace function public.booking_holds_seat(
  p_status     public.booking_status,
  p_pending_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  /*
   * ~~and (status = 'confirmed' or pending_at is null or pending_at >= now() -
   * online_payment_window())~~ — REMOVED (round 26, item 1).
   *
   * That clause existed because an unpaid booking held a seat for thirty
   * minutes. Under pay-first there is no unpaid booking: the row is created by
   * the webhook, already paid. The argument is kept in the signature so every
   * caller and every view keeps working unchanged, and because the legacy
   * `qr`/`cash` rows still carry a stamp — one that must no longer take their
   * seat away.
   *
   * IT IS NO LONGER `now()`-DEPENDENT, which is the quiet win: the function is
   * genuinely IMMUTABLE again, so a seat count cannot change between two reads
   * in the same request.
   */
  select p_status in ('reserved', 'confirmed');
$$;

/*
 * AND THE ROSTER STOPS HIDING NAMES, because there is nothing left to hide.
 * Round 25 anonymised a seat held by a checkout in progress; pay-first means no
 * such seat exists. `booking_is_named` returns true for every seat that counts.
 *
 * THE COLUMN AND THE FUNCTION STAY — see the header of the cleanup script. The
 * view keeps projecting `is_pending` (always false now) so the deployed
 * application, which selects it, does not break the moment this is applied.
 */
create or replace function public.booking_is_named(
  p_status     public.booking_status,
  p_pending_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('reserved', 'confirmed');
$$;

-- -----------------------------------------------------------------------------
-- 6. The new notification kind
--
-- Restated in full: Postgres cannot extend a CHECK in place, and the catalog
-- rule this repo has been bitten by three times says drop and re-add with the
-- whole list.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_catalog;
alter table public.notifications add constraint notifications_kind_catalog check (
  kind is null or kind in ('no_show_warning', 'no_show_cleared', 'checkout_game_full')
);

-- -----------------------------------------------------------------------------
-- 7. The capability flag
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true,
    'organizerTelegram',    true,
    'playersMet',           true,
    'playedSweep',          true,
    'playerNotifications',  true,
    'pendingSeatAnonymous', true,
    'payFirstCheckout',     true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps    jsonb;
  v_a       uuid;
  v_b       uuid;
  v_venue   uuid;
  v_game    uuid;
  v_outcome text;
  v_balance integer;
  v_open    integer;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'payFirstCheckout')::boolean, false) is not true then
    raise exception 'pay first: the capability flag did not turn on';
  end if;

  select id into v_a from public.players where auth_user_id is not null order by created_at limit 1;
  select id into v_b from public.players where auth_user_id is not null and id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then
    raise notice 'pay first: fewer than two signed-up players — shape checked, race NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    insert into public.venues (name) values ('pay first probe') returning id into v_venue;
    -- CAPACITY ONE. The whole point is what the second payer gets.
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status)
         values ('pay first probe', v_venue, now() + interval '2 days', 1, 150, 'published')
      returning id into v_game;

    insert into public.checkout_sessions
           (stripe_session_id, game_id, player_id, guest_count, amount_czk)
         values ('cs_probe_first', v_game, v_a, 0, 150),
                ('cs_probe_second', v_game, v_b, 0, 150);

    -- NO SEAT IS TAKEN BY A SHOPPER. Two open checkouts, zero seats.
    if public.game_seats_taken(v_game) <> 0 then
      raise exception 'pay first: an open checkout took a seat (% taken)',
        public.game_seats_taken(v_game);
    end if;

    -- The first payer gets the seat.
    select public.settle_checkout_session('cs_probe_first', 150) into v_outcome;
    if v_outcome <> 'booked' then
      raise exception 'pay first: the first payer got % rather than booked', v_outcome;
    end if;
    if public.game_seats_taken(v_game) <> 1 then
      raise exception 'pay first: the booking did not take its seat';
    end if;

    -- ACTIVE EXPIRY now names the second session, because the game is full.
    select count(*) into v_open from public.checkouts_to_expire(v_game);
    if v_open <> 1 then
      raise exception 'pay first: expected 1 checkout to expire, got %', v_open;
    end if;

    -- THE RESIDUAL: the second payer completes anyway, in the same instant.
    select coalesce(sum(delta_czk), 0) into v_balance
      from public.credit_ledger where player_id = v_b;

    select public.settle_checkout_session('cs_probe_second', 150) into v_outcome;
    if v_outcome <> 'credited' then
      raise exception 'pay first: the second payer got % rather than credited', v_outcome;
    end if;

    if (select coalesce(sum(delta_czk), 0) from public.credit_ledger where player_id = v_b)
       <> v_balance + 150 then
      raise exception 'pay first: the second payer was not credited in full';
    end if;

    if not exists (select 1 from public.notifications
                    where recipient_id = v_b and kind = 'checkout_game_full') then
      raise exception 'pay first: the second payer was not told';
    end if;

    if not exists (select 1 from public.checkout_sessions
                    where stripe_session_id = 'cs_probe_second' and attention_at is not null) then
      raise exception 'pay first: the credited checkout is not in the attention queue';
    end if;

    -- AND THE GAME IS NOT OVERSOLD.
    if public.game_seats_taken(v_game) <> 1 then
      raise exception 'pay first: the game was oversold (% seats on a capacity of 1)',
        public.game_seats_taken(v_game);
    end if;

    -- REDELIVERY IS A NO-OP.
    select public.settle_checkout_session('cs_probe_first', 150) into v_outcome;
    if v_outcome <> 'already' then
      raise exception 'pay first: a redelivered webhook answered %', v_outcome;
    end if;

    raise exception 'pay_first_probe_rollback';
  exception
    when others then
      if sqlerrm <> 'pay_first_probe_rollback' then
        raise;
      end if;
      raise notice 'pay first: exercised and undone — shoppers take no seat, first payer booked, second credited in full and told, nothing oversold, redelivery a no-op';
  end;
end $$;
