-- =============================================================================
-- Phase 20a assertions — the game pass, and the Phase 1 wallet invariants
-- re-proved STRAIGHT THROUGH the new batch allocation
--
-- Run:  node supabase/tests/run.mjs game_pass
--
-- Transaction-wrapped and rolled back.
--
-- THIS SUITE HAS TWO JOBS AND THE SECOND IS THE IMPORTANT ONE.
--
-- The first is the pass behaviour: tiers, the exact-price exception,
-- soonest-expiring-first consumption, refunds returning to their batch, the
-- sweep.
--
-- The second is that `create_booking` and `cancel_booking` — the two functions
-- Phase 1 proved and that this migration rewrote — STILL HOLD EVERY INVARIANT
-- THEY HELD BEFORE. A suite that only tested the new behaviour would be a
-- suite that passed while the wallet broke, because the new behaviour is the
-- part someone thought about. So the non-negative ledger, the double-spend
-- guard and the last-spot race are all re-asserted here, on a wallet made
-- entirely of expiring batches — the shape that did not exist when they were
-- first proved.
--
-- `call()` is the value-consuming probe (POLISH.md).
-- =============================================================================

begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

create function pg_temp.call(sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'select (' || sql || ')::text' into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
end $$;

/** Balance, THE ONLY WAY IT IS EVER COMPUTED: SUM(delta_czk). */
create function pg_temp.balance(p_player uuid)
returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer
    from public.credit_ledger where player_id = p_player;
$$;

/** What is left in a batch, from the product's own function. */
create function pg_temp.remaining(p_player uuid, p_batch uuid)
returns integer language sql security definer as $$
  select remaining_czk from public.credit_batches(p_player) where batch_id = p_batch;
$$;

/** How many batches a player holds. */
create function pg_temp.batch_count(p_player uuid)
returns bigint language sql security definer as $$
  select count(*) from public.credit_batches(p_player);
$$;

/** The smallest remainder across a player's batches — the per-batch floor. */
create function pg_temp.min_remaining(p_player uuid)
returns integer language sql security definer as $$
  select coalesce(min(remaining_czk), 0)::integer from public.credit_batches(p_player);
$$;

/** The single batch a player holds, when a fixture made exactly one. */
create function pg_temp.only_batch(p_player uuid)
returns uuid language sql security definer as $$
  select batch_id from public.credit_batches(p_player) limit 1;
$$;

/** Marks a booking paid, without going through the admin RPC. Fixture lever. */
create function pg_temp.confirm(p_booking uuid)
returns void language sql security definer as $$
  update public.bookings set status = 'confirmed' where id = p_booking;
$$;

/**
 * Clears a player's wallet and bookings between scenarios.
 *
 * SECURITY DEFINER because `credit_ledger` is append-only BY PRIVILEGE — no
 * session may delete from it, which is the invariant, not an obstacle. The
 * suite needs a clean wallet per scenario and says so out loud rather than
 * reaching around the grant quietly.
 */
create function pg_temp.reset_wallet(p_player uuid)
returns void language sql security definer as $$
  delete from public.credit_ledger where player_id = p_player;
  delete from public.bookings where player_id = p_player;
$$;

/** Ordinary, never-expiring credit. */
create function pg_temp.grant_plain(p_player uuid, p_amount integer)
returns void language sql security definer as $$
  insert into public.credit_ledger (player_id, delta_czk, reason)
  values (p_player, p_amount, 'admin_grant');
$$;

/** Grants a batch directly, for the fixtures that need a specific expiry. */
create function pg_temp.grant_batch(p_player uuid, p_amount integer, p_expires timestamptz)
returns uuid language sql security definer as $$
  insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
  values (p_player, p_amount, 'topup', p_expires)
  returning id;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000020a1', 'admin-20a@test.invalid'),
  ('b0000000-0000-0000-0000-0000000020a2', 'passer-20a@test.invalid'),
  ('c0000000-0000-0000-0000-0000000020a3', 'racer-20a@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-0000000020a1', 'Admin20a',  'admin-20a@test.invalid',  'a0000000-0000-0000-0000-0000000020a1', true),
  ('bbbb0000-0000-0000-0000-0000000020a2', 'Passer',    'passer-20a@test.invalid', 'b0000000-0000-0000-0000-0000000020a2', false),
  ('cccc0000-0000-0000-0000-0000000020a3', 'Racer',     'racer-20a@test.invalid',  'c0000000-0000-0000-0000-0000000020a3', false);

insert into public.venues (id, name) values
  ('11110000-0000-0000-0000-0000000020a1', 'Pass Pitch');

insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status) values
  ('dddd0000-0000-0000-0000-0000000020a1', 'Pass Pitch', '11110000-0000-0000-0000-0000000020a1',
   now() + interval '5 days', 10, 150, 'published'),
  ('dddd0000-0000-0000-0000-0000000020a2', 'Pass Pitch', '11110000-0000-0000-0000-0000000020a1',
   now() + interval '6 days', 10, 150, 'published'),
  ('dddd0000-0000-0000-0000-0000000020a3', 'Pass Pitch', '11110000-0000-0000-0000-0000000020a1',
   now() + interval '7 days', 1, 150, 'published');

-- =============================================================================
-- The tiers (§4.2)
-- =============================================================================

select pg_temp.ok(
  (select count(*) = 6 from public.pass_tiers),
  'six tiers ship');

select pg_temp.ok(
  (select bool_and(credited_czk = games * 150) from public.pass_tiers),
  'credited value is always games x 150 — the CHECK, restated as an assertion');

select pg_temp.ok(
  (select price_czk = 150 and credited_czk = 150 and expires_months is null
     from public.pass_tiers where games = 1),
  'the 1-game tier is not a discount and does not expire — the ordinary top-up, priced honestly');

select pg_temp.ok(
  (select price_czk = 700 and credited_czk = 750 and expires_months = 1
     from public.pass_tiers where games = 5),
  'the 5-pass: 700 buys 750, expiring in a month');

select pg_temp.ok(
  (select count(distinct price_czk) = 6 from public.pass_tiers),
  'every tier price is distinct — the exact-price match depends on it');

select set_config('role', 'anon', true);
select pg_temp.ok_call(
  $q$select count(*) from public.pass_tiers$q$,
  '6',
  'anon reads the tiers — the pass panel renders for a signed-out visitor');
reset role;

-- =============================================================================
-- Purchase, and THE ONE EXCEPTION to credited-equals-received
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-0000000020a2');

do $$
declare
  v_topup public.credit_topups;
begin
  v_topup := public.create_pass_topup(5);

  perform pg_temp.ok(
    v_topup.amount_czk = 700 and v_topup.pass_games = 5,
    'a pass request is priced from the TIER, not from anything the caller sent');

  perform pg_temp.ok(
    v_topup.payment_code::text like '27%',
    'a pass uses the same 27-series VS as any other top-up');

  -- Pending top-ups are not balance. Unchanged from Phase 8 and re-asserted
  -- here because a pass is the first top-up worth more than it cost.
  perform pg_temp.ok(
    pg_temp.balance('bbbb0000-0000-0000-0000-0000000020a2') = 0,
    'a pending pass contributes nothing to the balance');
end $$;

select pg_temp.ok_call(
  $q$select (public.create_pass_topup(7)).id$q$,
  'raise:PASS_TIER_NOT_FOUND',
  'a tier that does not exist is refused rather than priced at zero');

reset role;
select pg_temp.as_service();

do $$
declare
  v_topup public.credit_topups;
  v_result public.topup_result;
  v_batch uuid;
begin
  select * into v_topup from public.credit_topups
   where player_id = 'bbbb0000-0000-0000-0000-0000000020a2' limit 1;

  -- EXACT match on the pass price -> the pass VALUE is credited, with expiry.
  v_result := public.confirm_topup(v_topup.id, 'aaaa0000-0000-0000-0000-0000000020a1', 700);

  perform pg_temp.ok(
    v_result.credited_czk = 750,
    'an exact 700 credits the 5-pass VALUE of 750 — the one exception to credited-equals-received',
    v_result.credited_czk::text);

  perform pg_temp.ok(
    pg_temp.balance('bbbb0000-0000-0000-0000-0000000020a2') = 750,
    'and the balance is still SUM(delta_czk)');

  v_batch := pg_temp.only_batch('bbbb0000-0000-0000-0000-0000000020a2');
  perform pg_temp.ok(
    v_batch is not null,
    'the credit lands as a BATCH row carrying an expiry');

  perform pg_temp.ok(
    (select expires_at > now() + interval '25 days'
       and expires_at < now() + interval '35 days'
       from public.credit_ledger where id = v_batch),
    'the 5-pass expires in about a month');

  -- ALL THREE NUMBERS on the event, because they differ (§4.2).
  perform pg_temp.ok(
    (select metadata ->> 'received_czk' = '700'
        and metadata ->> 'credited_czk' = '750'
        and metadata ->> 'expires_at' is not null
       from public.events
      where event_type = 'topup_confirmed'
        and player_id = 'bbbb0000-0000-0000-0000-0000000020a2'
      order by created_at desc limit 1),
    'the event records received, credited AND expires — a receipt showing one is what a dispute is argued from');
end $$;

-- =============================================================================
-- THE CLARIFIED KEYING (ruled 2026-08-02): intent AND amount
--
-- An ordinary top-up of a coincidental tier amount is an ORDINARY TOP-UP.
-- Free entry admits 50–2000, so a player typing 700 into the top-up form is
-- entirely plausible — and crediting them 750 with a one-month expiry would
-- transform money they meant to keep permanently. This is the assertion that
-- says it cannot happen.
-- =============================================================================

do $$
declare
  v_topup public.credit_topups;
  v_result public.topup_result;
begin
  perform pg_temp.reset_wallet('bbbb0000-0000-0000-0000-0000000020a2');

  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000020a2');
  -- The ORDINARY path: no tier chosen, an amount that happens to equal one.
  v_topup := public.create_topup(700);

  perform pg_temp.ok(
    v_topup.pass_games is null,
    'an ordinary top-up records no tier, whatever the amount');

  perform pg_temp.as_service();
  v_result := public.confirm_topup(v_topup.id, 'aaaa0000-0000-0000-0000-0000000020a1', 700);

  perform pg_temp.ok(
    v_result.credited_czk = 700,
    'an ordinary 700 credits 700 — never 750. The player meant 700 CZK that keeps',
    v_result.credited_czk::text);

  perform pg_temp.ok(
    pg_temp.batch_count('bbbb0000-0000-0000-0000-0000000020a2') = 0,
    'and it carries NO expiry — an unasked bonus is not a kindness when it makes money run out');
end $$;

reset role;

-- A pass paid at ANOTHER tier's price is a mispayment, not a purchase of that
-- other tier. Crediting 1200 on the strength of a coincidence would hand over
-- 450 CZK nobody asked for.
do $$
declare
  v_topup public.credit_topups;
  v_result public.topup_result;
begin
  perform pg_temp.reset_wallet('bbbb0000-0000-0000-0000-0000000020a2');

  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000020a2');
  v_topup := public.create_pass_topup(5);   -- 700

  perform pg_temp.as_service();
  v_result := public.confirm_topup(
    v_topup.id, 'aaaa0000-0000-0000-0000-0000000020a1', 1080);  -- the 8-pass price

  perform pg_temp.ok(
    v_result.credited_czk = 1080,
    'a 5-pass paid at the 8-pass price credits what arrived, not the 8-pass value',
    v_result.credited_czk::text);

  perform pg_temp.ok(
    pg_temp.batch_count('bbbb0000-0000-0000-0000-0000000020a2') = 0,
    'and no expiry — it is a mispaid pass, which is a top-up');
end $$;

reset role;

-- And the chosen tier, paid exactly, still gets the pass. Restated here beside
-- its counter-cases so the whole rule reads in one place.
do $$
declare
  v_topup public.credit_topups;
  v_result public.topup_result;
begin
  perform pg_temp.reset_wallet('bbbb0000-0000-0000-0000-0000000020a2');

  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000020a2');
  v_topup := public.create_pass_topup(5);

  perform pg_temp.as_service();
  v_result := public.confirm_topup(v_topup.id, 'aaaa0000-0000-0000-0000-0000000020a1', 700);

  perform pg_temp.ok(
    v_result.credited_czk = 750,
    'a CHOSEN 5-pass paid at exactly 700 still credits 750');

  perform pg_temp.ok(
    pg_temp.batch_count('bbbb0000-0000-0000-0000-0000000020a2') = 1,
    'and it lands as a batch with an expiry');
end $$;

reset role;

-- Any other amount falls back to the standing rule.
do $$
declare
  v_topup public.credit_topups;
  v_result public.topup_result;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c0000000-0000-0000-0000-0000000020a3', 'role', 'authenticated')::text, true);
  v_topup := public.create_pass_topup(5);

  perform pg_temp.as_service();
  -- 690 against a 700 pass: a top-up, not a purchase.
  v_result := public.confirm_topup(v_topup.id, 'aaaa0000-0000-0000-0000-0000000020a1', 690);

  perform pg_temp.ok(
    v_result.credited_czk = 690,
    'a near miss credits exactly what arrived — not the pass value, and not nothing',
    v_result.credited_czk::text);

  perform pg_temp.ok(
    pg_temp.batch_count('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'and it carries NO expiry — a short payment is a top-up, and top-ups do not expire');
end $$;

reset role;

-- =============================================================================
-- Consumption: soonest-expiring first
-- =============================================================================

do $$
declare
  v_soon uuid;
  v_late uuid;
  v_result public.booking_result;
begin
  -- A clean wallet: two batches and some ordinary credit.
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');

  v_late := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 300, now() + interval '60 days');
  v_soon := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 100, now() + interval '5 days');
  perform pg_temp.grant_plain('cccc0000-0000-0000-0000-0000000020a3', 500);

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 900,
    'the fixture wallet is 900');

  -- Booked AS the player: `create_booking` takes identity from the session and
  -- accepts a player id only to refuse it.
  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  -- A 150 game: the soonest batch has 100, so it is emptied and the rest comes
  -- from the next one.
  v_result := public.create_booking('dddd0000-0000-0000-0000-0000000020a1', 'cash');

  perform pg_temp.ok(
    v_result.credit_applied_czk = 150 and v_result.status = 'confirmed',
    'the whole price came out of the wallet');

  perform pg_temp.ok(
    pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_soon) = 0,
    'the SOONEST-expiring batch is emptied first',
    coalesce(pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_soon)::text, 'null'));

  perform pg_temp.ok(
    pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_late) = 250,
    'the later batch covers the remainder — 50 of it');

  -- The ordinary pool is untouched while any batch has anything in it.
  perform pg_temp.ok(
    (select coalesce(sum(delta_czk), 0) = 500
       from public.credit_ledger
      where player_id = 'cccc0000-0000-0000-0000-0000000020a3'
        and expires_at is null and batch_id is null),
    'never-expiring credit is spent LAST — otherwise the pass expires while the permanent credit goes');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 750,
    'and balance is still SUM(delta_czk), down by exactly the price');
end $$;

-- =============================================================================
-- Refunds return to the batch they came from
--
-- §4.2: refunding pass credit as never-expiring credit would turn a
-- booking-and-cancelling loop into a way to launder an expiry away.
-- =============================================================================

do $$
declare
  v_soon uuid;
  v_late uuid;
  v_booking uuid;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');

  v_late := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 300, now() + interval '60 days');
  v_soon := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 100, now() + interval '5 days');

  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  v_booking := (public.create_booking('dddd0000-0000-0000-0000-0000000020a1', 'cash')).id;
  perform public.cancel_booking(v_booking);

  perform pg_temp.ok(
    pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_soon) = 100,
    'the 100 taken from the soonest batch goes BACK to it',
    coalesce(pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_soon)::text, 'null'));

  perform pg_temp.ok(
    pg_temp.remaining('cccc0000-0000-0000-0000-0000000020a3', v_late) = 300,
    'and the 50 taken from the later one goes back to that one');

  -- The refund carries the batch's ORIGINAL expiry, which is the whole point.
  perform pg_temp.ok(
    (select count(*) = 0
       from public.credit_ledger
      where player_id = 'cccc0000-0000-0000-0000-0000000020a3'
        and reason = 'cancellation_credit'
        and batch_id is null),
    'no part of the refund became never-expiring credit — a cancel loop cannot launder an expiry away');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 400,
    'the wallet is whole again');
end $$;

reset role;

-- A CASH-paid cancellation still credits WITHOUT expiry, unchanged from Phase 1.
do $$
declare
  v_booking uuid;
  v_batch uuid;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');

  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  v_booking := (public.create_booking('dddd0000-0000-0000-0000-0000000020a2', 'cash')).id;
  -- Paid in cash, so the whole price is accounted for.
  perform pg_temp.confirm(v_booking);
  perform public.cancel_booking(v_booking);

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 150,
    'a cash-paid cancellation still credits the price');

  perform pg_temp.ok(
    pg_temp.batch_count('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'and it credits WITHOUT an expiry — Phase 1 behaviour, unchanged');
end $$;

reset role;

-- =============================================================================
-- The sweep
-- =============================================================================

do $$
declare
  v_batch uuid;
  v_swept integer;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');
  v_batch := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 400, now() - interval '1 hour');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 400,
    'an expired-but-unswept batch is STILL in the balance — the accepted window, and it errs in the player''s favour');

  perform pg_temp.as_service();
  v_swept := public.expire_credit_batches();

  perform pg_temp.ok(v_swept >= 1, 'the sweep finds it');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'and closes it with a COMPENSATING NEGATIVE ROW — balance is still SUM(delta_czk), never a filtered query');

  perform pg_temp.ok(
    (select count(*) = 1 from public.credit_ledger
      where batch_id = v_batch and reason = 'pass_expiry'),
    'the closing row says why it exists');

  perform pg_temp.ok(
    (select count(*) = 1 from public.events
      where event_type = 'credit_expired'
        and player_id = 'cccc0000-0000-0000-0000-0000000020a3'),
    'and it writes its event, in the same transaction');

  -- IDEMPOTENT, like every other cron-driven function here.
  perform pg_temp.ok(
    public.expire_credit_batches() = 0,
    'a second sweep expires nothing — a cron route that can double-charge will');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'and the balance did not move again');
end $$;

reset role;

-- The heads-up, and its idempotency guard.
do $$
declare
  v_batch uuid;
  v_first integer;
  v_second integer;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');
  v_batch := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 400, now() + interval '2 days');

  perform pg_temp.as_service();
  select count(*) into v_first from public.batches_expiring_soon(3);
  select count(*) into v_second from public.batches_expiring_soon(3);

  perform pg_temp.ok(v_first = 1, 'a batch expiring in two days is warned about');
  perform pg_temp.ok(v_second = 0, 'and only once — the stamp is written by the same statement that selects it');
end $$;

reset role;

-- An emptied batch is not worth an email.
do $$
declare
  v_batch uuid;
  v_count integer;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');
  v_batch := pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 150, now() + interval '2 days');

  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  perform public.create_booking('dddd0000-0000-0000-0000-0000000020a2', 'cash');

  perform pg_temp.as_service();
  select count(*) into v_count from public.batches_expiring_soon(3);
  perform pg_temp.ok(
    v_count = 0,
    'a fully spent batch raises no heads-up — "your 0 CZK expires on Friday" is worse than silence');
end $$;

reset role;

-- =============================================================================
-- THE PHASE 1 WALLET INVARIANTS, re-proved THROUGH the batch allocation
--
-- This is the half of the suite that matters most. Each of these was proved in
-- Phase 1 against a flat ledger; none of them had ever run against a wallet
-- made of expiring batches, because that shape did not exist.
-- =============================================================================

-- --- 1. The ledger never goes negative ---------------------------------------

do $$
declare
  v_result public.booking_result;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');

  -- 40 CZK, in a batch, against a 150 game.
  perform pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 40, now() + interval '10 days');

  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  v_result := public.create_booking('dddd0000-0000-0000-0000-0000000020a1', 'qr');

  perform pg_temp.ok(
    v_result.credit_applied_czk = 40 and v_result.amount_due_czk = 110,
    'a partial batch balance is applied in full and the rest is owed');

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'the wallet lands at exactly zero, never below');

  perform pg_temp.ok(
    pg_temp.min_remaining('cccc0000-0000-0000-0000-0000000020a3') >= 0,
    'and no BATCH went negative either — the per-batch invariant the flat ledger never had');
end $$;

reset role;

-- --- 2. No double-spend across two bookings ----------------------------------
--
-- Sequential here, not concurrent: the concurrent proof is
-- `supabase/tests/concurrency/` and `e2e/concurrency.spec.ts`, which run two
-- real sessions. What this asserts is the arithmetic those depend on — that
-- the second booking re-reads a balance the first already reduced, now that
-- the reduction is spread across batch rows.

do $$
declare
  v_first  public.booking_result;
  v_second public.booking_result;
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');

  -- Exactly one game's worth, in a batch.
  perform pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 150, now() + interval '10 days');

  perform pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
  v_first  := public.create_booking('dddd0000-0000-0000-0000-0000000020a1', 'cash');
  v_second := public.create_booking('dddd0000-0000-0000-0000-0000000020a2', 'cash');

  perform pg_temp.ok(
    v_first.credit_applied_czk = 150,
    'the first booking spends the batch');

  perform pg_temp.ok(
    v_second.credit_applied_czk = 0 and v_second.amount_due_czk = 150,
    'the second spends NOTHING — the same 150 cannot buy two games',
    v_second.credit_applied_czk::text);

  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 0,
    'and the wallet is zero, not minus 150');
end $$;

reset role;

-- --- 3. The last spot is still capacity, not credit ---------------------------
--
-- Capacity remains the sole booking limit. A wallet full of pass credit does
-- not buy a spot that does not exist, and the refusal is CAPACITY_FULL rather
-- than anything about money.

do $$
begin
  perform pg_temp.reset_wallet('cccc0000-0000-0000-0000-0000000020a3');
  perform pg_temp.grant_batch('cccc0000-0000-0000-0000-0000000020a3', 3000, now() + interval '10 days');
  perform pg_temp.grant_batch('bbbb0000-0000-0000-0000-0000000020a2', 3000, now() + interval '10 days');

  -- Game 3 has capacity 1. The first booking takes it.
  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000020a2');
  perform public.create_booking('dddd0000-0000-0000-0000-0000000020a3', 'cash');
end $$;

select pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
select pg_temp.ok_call(
  $q$select (public.create_booking('dddd0000-0000-0000-0000-0000000020a3', 'cash')).id$q$,
  'raise:CAPACITY_FULL',
  'the last spot is decided by capacity — a wallet full of pass credit does not conjure one');

do $$
begin
  perform pg_temp.ok(
    pg_temp.balance('cccc0000-0000-0000-0000-0000000020a3') = 3000,
    'and the refused booking spent nothing — the whole transaction rolled back');
end $$;

reset role;

-- --- 4. Authorization on the new functions ------------------------------------

select pg_temp.act_as('c0000000-0000-0000-0000-0000000020a3');
select pg_temp.ok_call(
  $q$select public.expire_credit_batches()$q$,
  'denied',
  'a player cannot run the expiry sweep');
select pg_temp.ok_call(
  $q$select count(*) from public.batches_expiring_soon(3)$q$,
  'denied',
  'nor read whose credit is about to expire');
select pg_temp.ok_call(
  $q$select public.apply_credit('cccc0000-0000-0000-0000-0000000020a3'::uuid, null::uuid, 500)$q$,
  'denied',
  'nor call the allocator directly — it writes ledger rows and takes a player id');
-- FOUND BY THIS ASSERTION, and it was a real one. `credit_batches` takes a
-- PLAYER ID, and a first draft granted it to `authenticated` — which would
-- have let any signed-in player read any other player's wallet: how much they
-- hold, in how many batches, and when each expires. `credit_ledger` has
-- carried own-row RLS since Phase 1 precisely so that cannot happen, and a
-- SECURITY DEFINER function bypassing it must not be handed to sessions.
select pg_temp.ok_call(
  $q$select count(*) from public.credit_batches('bbbb0000-0000-0000-0000-0000000020a2')$q$,
  'denied',
  'a player cannot read ANOTHER player''s batches — the function takes an id and bypasses RLS');

-- Racer holds exactly the one batch the capacity scenario granted; Passer
-- holds two. The number is not the point — that the answer is about the CALLER
-- and takes no argument is.
select pg_temp.ok_call(
  $q$select count(*) from public.my_credit_batches()$q$,
  '1',
  'the session-scoped exit answers about the caller, and takes no argument to answer about anyone else');
reset role;

select set_config('role', 'anon', true);
select pg_temp.ok_call(
  $q$select (public.create_pass_topup(5)).id$q$,
  'denied',
  'anon cannot request a pass');
select pg_temp.ok_call(
  $q$select count(*) from public.credit_ledger$q$,
  'denied',
  'and still cannot read the ledger at all');
reset role;

-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
