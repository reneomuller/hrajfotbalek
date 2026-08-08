-- =============================================================================
-- v1.3 conformance — the RPC outcomes Stages 2 and 6 draw
--
-- Run:  node supabase/tests/run.mjs v13_conformance/rpc
--
-- Transaction-wrapped and rolled back.
--
-- WHAT THIS SUITE CAN AND CANNOT DO, stated first because one acceptance
-- criterion asks for something a SQL suite is structurally incapable of.
--
-- "Two CONCURRENT create_booking calls produce exactly one booking" cannot be
-- asserted here. Everything in this file runs in ONE transaction on ONE
-- connection; there is no second session to race against, and a sequential
-- pair of calls exercises the capacity check but never the lock. Claiming
-- otherwise would be the most dangerous kind of green test — one that reports
-- on a mechanism it never engaged.
--
-- The real race is covered, and elsewhere:
--   supabase/tests/concurrency/booking_race.mjs   two live connections
--   e2e/concurrency.spec.ts                       four specs, including
--                                                 "two players racing for the
--                                                 last spot leave exactly one
--                                                 booking" and "a wallet cannot
--                                                 be spent twice"
--
-- So this suite asserts the MECHANISMS that make the race resolvable — the
-- partial unique index, the capacity check, the named refusals — and defers
-- the race itself to the harnesses that can actually run one.
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

-- Returns the SQLSTATE/message of a failed call, or 'ok', so a named refusal
-- can be asserted by name rather than by "it threw something".
create function pg_temp.why(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when insufficient_privilege then return 'denied';
  when others then return split_part(sqlerrm, ':', 1);
end $$;

-- =============================================================================
-- 1. The double-tap backstop is an INDEX, not a check in the function
--
-- A guard inside the RPC is evaluated before the insert; two sessions can both
-- pass it. The partial unique index is what makes a second active booking
-- impossible rather than merely unlikely, and it is partial precisely so a
-- cancelled booking does not block re-booking the same game.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'bookings'
      and indexname = 'bookings_one_active_per_player_per_game') = 1,
  'the partial unique index on (game_id, player_id) exists');

select pg_temp.ok(
  (select indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'bookings'
      and indexname = 'bookings_one_active_per_player_per_game')
    like '%WHERE (status = ANY (ARRAY[''reserved''::booking_status, ''confirmed''::booking_status]))%',
  'it is PARTIAL on active statuses — a cancelled booking must not block a rebook',
  (select indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'bookings'
      and indexname = 'bookings_one_active_per_player_per_game'));

-- =============================================================================
-- 2. Every refusal the UI renders has a NAME
--
-- Stage 2's claim bar and Stage 6's dialogs render a specific sentence per
-- failure. A generic exception gives them nothing to switch on, so the
-- refusals are asserted to exist by name in the function that raises them.
-- =============================================================================

select pg_temp.ok(
  (select bool_and(prosrc like '%' || code || '%')
     from pg_proc,
          lateral (values ('CAPACITY_FULL'), ('DUPLICATE_ACTIVE_BOOKING'),
                          ('GAME_NOT_BOOKABLE'), ('GAME_ALREADY_STARTED'),
                          ('CREDIT_NEGATIVE_BLOCKED'), ('PLAYER_NOT_FOUND')) as c(code)
    where proname = 'create_booking_internal'),
  'create_booking_internal raises named refusals the UI can switch on');

select pg_temp.ok(
  (select prosrc ~ 'CANCEL_WINDOW_CLOSED' from pg_proc where proname = 'cancel_booking'),
  'cancel_booking names its window refusal');

-- =============================================================================
-- 3. Cancellation is ADDITIVE — there is no hard-delete path
--
-- Ruling O refused "delete game, no record". The same principle governs a
-- booking: an event log with a hole in it is worse than a visible cancelled
-- row.
-- =============================================================================

select pg_temp.ok(
  (select prosrc !~* 'delete\s+from' from pg_proc where proname = 'cancel_booking'),
  'cancel_booking contains no DELETE — the row is marked, never removed');

select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~* 'delete\s+from\s+public\.bookings') = 0,
  'no function anywhere hard-deletes a booking',
  (select coalesce(string_agg(p.proname, ', '), 'none')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~* 'delete\s+from\s+public\.bookings'));

/*
 * THE REFUND IS CREDIT, AND THE PLAN SAYS "IN KIND". The plan is describing
 * ruling O as written; the product implements the half of it that exists.
 *
 * `cancel_booking` refunds via `cancellation_credit` and never reads
 * `payment_method` — asserted below, because the absence is the point.
 * `policy.cancellation.refundAs` is "credit", and migration 20260720120000
 * states there is no cash-refund path anywhere in the system. Money never
 * leaves, by Phase 1 design; the cash-to-cash half is quarantined
 * (SCOPE.md §1).
 *
 * A probe asserting "the refund matches the original payment method" would
 * therefore fail against correct code, and the correct response would be to
 * build a cash-out feature nobody authorised.
 */
select pg_temp.ok(
  (select prosrc ~* 'cancellation_credit' from pg_proc where proname = 'cancel_booking'),
  'cancel_booking refunds as cancellation_credit');

select pg_temp.ok(
  (select prosrc !~* 'payment_method' from pg_proc where proname = 'cancel_booking'),
  'cancel_booking does NOT branch on payment_method — refunds are credit, always');

-- =============================================================================
-- 4. Behavioural: capacity, duplicates, waitlist position
--
-- Fixtures are built here and rolled back. Identity travels in a GUC because
-- auth.uid() reads request.jwt.claims, and a temp table is unreadable under a
-- switched role.
-- =============================================================================

create temp table _fx (game_id uuid, p1 uuid, p1_auth uuid, p2 uuid, p2_auth uuid)
  on commit drop;

insert into _fx (game_id)
select gen_random_uuid();

insert into public.games (id, venue, starts_at, capacity, price_czk, status, city, brand)
select game_id, 'rpc-conformance pitch', now() + interval '14 days', 1, 150,
       'published', 'Praha', 'hrajfotbal'
from _fx;

/*
 * Any player carrying an auth identity, NOT `is_seed` only.
 *
 * Exactly one seeded player has an `auth_user_id`, so filtering on `is_seed`
 * yields a null second player and the suite dies deep inside
 * `current_player_id` with `invalid input syntax for type uuid: ""` — an error
 * that names neither the fixture nor the filter that produced it. The fixture
 * assertion below is what turns that into a readable failure.
 */
/*
 * p1 is an ADMIN, p2 is NOT, and both are pinned by `is_admin` rather than by
 * created_at order.
 *
 * Ordering by creation happened to make p1 the Organizer, who is an admin —
 * so "the payer cannot confirm their own top-up" ran as an admin and got a
 * foreign-key error instead of a refusal. The probe was testing the wrong
 * person. Roles the suite depends on are now stated, not inherited from
 * whatever the seed inserted first.
 */
update _fx set
  p1 = (select id from public.players
         where auth_user_id is not null and is_admin order by created_at limit 1),
  p1_auth = (select auth_user_id from public.players
              where auth_user_id is not null and is_admin order by created_at limit 1);

update _fx set
  p2 = (select id from public.players
         where auth_user_id is not null and not is_admin
           and id <> (select p1 from _fx) order by created_at limit 1),
  p2_auth = (select auth_user_id from public.players
              where auth_user_id is not null and not is_admin
                and id <> (select p1 from _fx) order by created_at limit 1);

select pg_temp.ok(
  (select count(*) from _fx
    where p1 is not null and p2 is not null
      and p1_auth is not null and p2_auth is not null) = 1,
  'fixture: a capacity-1 game, an admin (p1) and a non-admin (p2), both with auth',
  (select 'p1_auth=' || coalesce(p1_auth::text, 'NULL')
       || ' p2_auth=' || coalesce(p2_auth::text, 'NULL') from _fx));

select set_config('rpc.game', (select game_id::text from _fx), true);
select set_config('rpc.p1',   (select p1_auth::text from _fx), true);
select set_config('rpc.p2',   (select p2_auth::text from _fx), true);
-- The player ids travel too: the assertions below run under `set local role
-- authenticated`, which cannot read a temp table owned by postgres.
select set_config('rpc.p2_player', (select p2::text from _fx), true);
select set_config('rpc.p1_player', (select p1::text from _fx), true);

-- Player 1 takes the only spot.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p1'))::text, true);

select pg_temp.ok(
  pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$) = 'ok',
  'the first claim on a capacity-1 game succeeds');

-- The same player claiming again is refused BY NAME, not by a generic error.
select pg_temp.ok(
  pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$)
    = 'DUPLICATE_ACTIVE_BOOKING',
  'a double-tap by the same player is refused as DUPLICATE_ACTIVE_BOOKING',
  pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$));

reset role;

-- Player 2 finds the game full. Sequential, not concurrent — this exercises the
-- capacity check, and says nothing about the lock (see the header).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p2'))::text, true);

select pg_temp.ok(
  pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$)
    = 'CAPACITY_FULL',
  'a second player is refused as CAPACITY_FULL — one spot, one booking',
  pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$));

-- Joining the waitlist, then joining it again: a repeat tap is a POSITION
-- REPORT, not an error. The player pressed the button twice because they were
-- unsure it worked, and an exception would tell them it did not.
select pg_temp.ok(
  pg_temp.why($q$select public.join_waitlist(current_setting('rpc.game')::uuid)$q$) = 'ok',
  'joining the waitlist on a full game succeeds');

select pg_temp.ok(
  pg_temp.why($q$select public.join_waitlist(current_setting('rpc.game')::uuid)$q$) = 'ok',
  'joining a SECOND time raises nothing');

select pg_temp.ok(
  (select public.waitlist_position(current_setting('rpc.game')::uuid)) = 1,
  'and the position is reported as 1 rather than duplicated',
  (select coalesce(public.waitlist_position(current_setting('rpc.game')::uuid)::text, 'null')));

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = current_setting('rpc.game')::uuid
      and player_id = current_setting('rpc.p2_player')::uuid
      and converted_booking_id is null) = 1,
  'exactly one waitlist row exists for that player, not two');

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- 5. A failed claim leaves the ledger and the roster exactly as they were
--
-- The failure that matters is a PARTIAL one: a ledger row written for a
-- booking that then could not be created leaves a player charged for a spot
-- they do not hold. Both sides are measured either side of the refusal.
-- =============================================================================

create temp table _before (ledger integer, roster integer, bookings integer) on commit drop;

insert into _before
select (select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger),
       (select count(*)::integer from public.game_roster_public
         where game_id = current_setting('rpc.game')::uuid),
       (select count(*)::integer from public.bookings
         where game_id = current_setting('rpc.game')::uuid);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p2'))::text, true);

-- Refused for capacity, having already been refused above; the point is what
-- the refusal LEFT BEHIND.
select pg_temp.why($q$select public.create_booking(current_setting('rpc.game')::uuid, 'qr')$q$);

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger)
    = (select ledger from _before),
  'a refused claim writes nothing to credit_ledger',
  'before=' || (select ledger from _before)::text
  || ' after=' || (select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger)::text);

select pg_temp.ok(
  (select count(*)::integer from public.game_roster_public
    where game_id = current_setting('rpc.game')::uuid) = (select roster from _before),
  'a refused claim adds no roster row');

select pg_temp.ok(
  (select count(*)::integer from public.bookings
    where game_id = current_setting('rpc.game')::uuid) = (select bookings from _before),
  'a refused claim creates no booking row at all');

-- =============================================================================
-- 6. Capacity is still the only limit
--
-- Restated here against the booking path specifically. Asserted in
-- v13_conformance/schema_a as a property of the function body; asserted here as
-- the reason player 2 was refused above — the game is 1-capacity and carries no
-- format or subs_per_team at all.
-- =============================================================================

select pg_temp.ok(
  (select capacity from public.games where id = current_setting('rpc.game')::uuid) = 1
  and (select format from public.games where id = current_setting('rpc.game')::uuid) is null
  and (select subs_per_team from public.games where id = current_setting('rpc.game')::uuid) is null,
  'the refusal came from capacity alone — format and subs_per_team are null');

-- =============================================================================
-- 7. create_topup — identity from the session, and a bounded amount
-- =============================================================================

select pg_temp.ok(
  (select pg_get_function_identity_arguments(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_topup') = 'p_amount_czk integer',
  'create_topup takes ONLY an amount — there is no player argument to forge');

select pg_temp.ok(
  (select prosrc ~ 'current_player_id\(\)' from pg_proc where proname = 'create_topup'),
  'create_topup resolves the player from the session');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p2'))::text, true);

select pg_temp.ok(
  pg_temp.why($q$select public.create_topup(49)$q$) = 'AMOUNT_OUT_OF_RANGE',
  'a 49 CZK top-up is refused — below the 50 floor',
  pg_temp.why($q$select public.create_topup(49)$q$));

select pg_temp.ok(
  pg_temp.why($q$select public.create_topup(2001)$q$) = 'AMOUNT_OUT_OF_RANGE',
  'a 2001 CZK top-up is refused — above the 2000 ceiling');

-- A legitimate one, kept for the assertions below.
select set_config('rpc.topup_ordinary',
  (select (public.create_topup(700)).id::text), true);

-- Back to postgres for these two: `authenticated` has no grant on `events` at
-- all (by design — the log is not a client surface), and the suite would die
-- with "permission denied for table events" while asserting that an event was
-- written correctly.
reset role;

select pg_temp.ok(
  left((select payment_code::text from public.credit_topups
         where id = current_setting('rpc.topup_ordinary')::uuid), 2) = '27',
  'the top-up drew a 27-series VS');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'topup_requested'
      and metadata ->> 'topup_id' = current_setting('rpc.topup_ordinary')) = 1,
  'create_topup emitted exactly one topup_requested event');

set local role authenticated;

-- A pass purchase, which is a DIFFERENT entry point carrying intent.
select set_config('rpc.topup_pass',
  (select (public.create_pass_topup(5)).id::text), true);

select pg_temp.ok(
  (select pass_games from public.credit_topups
    where id = current_setting('rpc.topup_pass')::uuid) = 5,
  'create_pass_topup records the chosen tier as intent');

select pg_temp.ok(
  (select pass_games from public.credit_topups
    where id = current_setting('rpc.topup_ordinary')::uuid) is null,
  'an ordinary top-up carries NO pass intent — the two paths cannot be confused');

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- 8. confirm_topup is admin-or-service-role, and a player cannot confirm
--
-- The whole point of the top-up rail: a player claims money was sent, and
-- somebody who can see a bank statement decides whether it was. A player
-- confirming their own claim is the product paying out on an assertion.
-- =============================================================================

select pg_temp.ok(
  (select prosrc ~ 'is_admin_caller\(\)' and prosrc ~ 'is_service_role\(\)'
     from pg_proc where proname = 'confirm_topup'),
  'confirm_topup admits only an admin caller or the service role');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p2'))::text, true);
select pg_temp.ok(
  pg_temp.why(format($q$select public.confirm_topup(%L::uuid, %L::uuid, 700)$q$,
                     current_setting('rpc.topup_ordinary'),
                     current_setting('rpc.p2_player'))) = 'INSUFFICIENT_PERMISSION',
  'the payer cannot confirm their own top-up',
  pg_temp.why(format($q$select public.confirm_topup(%L::uuid, %L::uuid, 700)$q$,
                     current_setting('rpc.topup_ordinary'),
                     current_setting('rpc.p2_player'))));
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- 9. THE PASS EXCEPTION — both halves required
--
-- The rule is intent AND exact amount. `pass_games` is null on every ordinary
-- top-up, so the branch is skipped entirely for them; when a tier WAS chosen,
-- the received amount must equal THAT tier's price. Not "some tier's price" —
-- paying the 8-pass amount against a 5-pass request is a mispayment, and
-- crediting the 8-pass value would hand over 450 CZK on a coincidence.
--
-- Asserted on both halves, because each alone would produce a plausible bug:
-- amount-only turns an ordinary 700 into a pass, and intent-only credits a
-- 690 near-miss as though it were exact.
-- =============================================================================

/*
 * Confirmed by the ADMIN, through a session.
 *
 * `set local role service_role` does NOT work here: is_service_role() reads
 * `request.jwt.claims ->> 'role'`, not the database role, so switching the DB
 * role leaves the claim empty and confirm_topup answers INSUFFICIENT_PERMISSION.
 * The admin path is the one a human actually uses, so it is the one asserted.
 */
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p1'))::text, true);

-- Half one: intent present, amount exact -> tier value, WITH an expiry.
select pg_temp.ok(
  pg_temp.why(format($q$select public.confirm_topup(%L::uuid, null, 700)$q$,
                     current_setting('rpc.topup_pass'))) = 'ok',
  'an admin confirms the 5-pass top-up at exactly 700');

/*
 * Back to postgres to READ the ledger.
 *
 * RLS on credit_ledger restricts `authenticated` to its OWN rows, and the
 * session here is the admin who confirmed — so p2's freshly written credit is
 * invisible and every assertion below reports "no row". The write needed a
 * session; the read must not have one.
 */
reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.ok(
  (select delta_czk from public.credit_ledger
    where reason = 'topup' and expires_at is not null
      and player_id = current_setting('rpc.p2_player')::uuid
    order by created_at desc limit 1) = 750,
  'a 5-pass paid at exactly 700 credits the tier value of 750',
  (select coalesce((select delta_czk::text from public.credit_ledger
     where reason = 'topup' and expires_at is not null
       and player_id = current_setting('rpc.p2_player')::uuid
     order by created_at desc limit 1), 'no row')));

select pg_temp.ok(
  (select expires_at is not null from public.credit_ledger
    where reason = 'topup'
      and player_id = current_setting('rpc.p2_player')::uuid
    order by created_at desc limit 1),
  'and it carries an expiry — a pass is time-limited credit');

-- Half two: no intent, tier-shaped amount -> face value, NO expiry.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rpc.p1'))::text, true);

select pg_temp.ok(
  pg_temp.why(format($q$select public.confirm_topup(%L::uuid, null, 700)$q$,
                     current_setting('rpc.topup_ordinary'))) = 'ok',
  'an admin confirms the ordinary 700 top-up');

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.ok(
  (select delta_czk from public.credit_ledger
    where reason = 'topup' and expires_at is null
      and player_id = current_setting('rpc.p2_player')::uuid
    order by created_at desc limit 1) = 700,
  'an ORDINARY 700 credits 700, never 750 — the amount alone is not enough',
  (select coalesce((select delta_czk::text from public.credit_ledger
     where reason = 'topup' and expires_at is null
       and player_id = current_setting('rpc.p2_player')::uuid
     order by created_at desc limit 1), 'no row')));

reset role;
select set_config('request.jwt.claims', '', true);

/*
 * The near-miss half — 690 against a 700 pass — is asserted end to end in
 * e2e/pass.spec.ts ("a near-miss payment credits what arrived, with no
 * expiry") rather than duplicated here. It needs a second pass top-up and a
 * second confirm against the same player, and the ledger assertions above
 * already read "the latest row", which a third confirm would make ambiguous.
 */

-- =============================================================================
-- 10. Batches: soonest expiry first, and a refund goes home
-- =============================================================================

select pg_temp.ok(
  (select prosrc ~ 'order by b\.expires_at asc' from pg_proc where proname = 'credit_batches'),
  'credit_batches orders by expiry ascending — soonest-expiring spends first');

select pg_temp.ok(
  (select prosrc ~ 'batch_id' from pg_proc where proname = 'apply_credit'),
  'apply_credit writes one negative row per batch it consumes');

select pg_temp.ok(
  (select prosrc ~ 'cl\.batch_id' and prosrc ~ 'b\.expires_at'
     from pg_proc where proname = 'cancel_booking'),
  'cancel_booking refunds to the ORIGINATING batch, carrying its own expiry');

-- =============================================================================
-- 11. The sweep, and the heads-up before it
--
-- The sweep is what closes the transient window in which expired credit is
-- still spendable. It writes a compensating row and an event rather than
-- filtering the balance, so the ledger explains where the money went.
-- =============================================================================

select pg_temp.ok(
  (select prosrc ~ 'credit_expired' from pg_proc where proname = 'expire_credit_batches'),
  'the sweep emits a credit_expired event per expired remainder');

select pg_temp.ok(
  (select prosrc ~ 'insert into public\.credit_ledger' from pg_proc
    where proname = 'expire_credit_batches'),
  'the sweep writes a compensating ledger row rather than hiding the credit');

select pg_temp.ok(
  (select pg_get_function_identity_arguments(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'batches_expiring_soon') = 'p_days integer',
  'batches_expiring_soon takes its window as an argument, so the cron owns the number');

select pg_temp.ok(
  (select prosrc ~ 'expiry_notified_at' from pg_proc where proname = 'batches_expiring_soon'),
  'it stamps expiry_notified_at, so the heads-up fires once and not every run');

-- =============================================================================
-- results
-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select
  count(*) as total,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed,
  case when count(*) filter (where not passed) = 0
       then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
