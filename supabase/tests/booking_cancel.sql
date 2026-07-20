-- =============================================================================
-- Phase 6 assertions — cancel_booking
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/booking_cancel.sql
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- Two fixture manipulations are made directly as the owner rather than through
-- an RPC, and both are deliberate:
--
--   * `starts_at` is moved into the past to simulate the passage of time.
--     create_booking refuses to book a game that has already started, so the
--     only way to reach "a booking on a game that has since kicked off" is to
--     book it while future and then advance the clock. games is a base table.
--   * A cash booking is set to `confirmed` directly. confirm_booking does not
--     exist until Phase 7; this file tests what cancel_booking does GIVEN a
--     confirmed booking, not how it came to be confirmed. Phase 7's suite
--     re-tests the same path end-to-end through the real confirm RPC.
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

create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  execute 'with _p as (' || sql || ') select count(*) from _p' into n;
  return 'rows:' || n;
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_probe(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.probe(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- Resolves a booking id while BYPASSING RLS (SECURITY DEFINER).
--
-- Needed for the cross-user test specifically. Reading the id inline as the
-- attacking player returns NULL — RLS already stops player B from even
-- discovering player A's booking — so cancel_booking would raise
-- BOOKING_NOT_FOUND and the ownership check inside the function would never be
-- exercised. That would be a test passing for the wrong reason. Handing the
-- attacker the id models the stronger threat: someone who already knows it.
create function pg_temp.booking_id_for(p_game_id uuid)
returns uuid language sql security definer as $$
  select b.id from public.bookings b where b.game_id = p_game_id
   order by b.created_at limit 1;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a@test.invalid'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b@test.invalid'),
  ('50000000-0000-0000-0000-000000000051', 'seed@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_seed) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'TstPlayerA', 'a@test.invalid',    'a0000000-0000-0000-0000-0000000000a1', false),
  ('bbbb0000-0000-0000-0000-00000000000b', 'TstPlayerB', 'b@test.invalid',    'b0000000-0000-0000-0000-0000000000b1', false),
  ('55550000-0000-0000-0000-000000000055', 'TstSeedBot', 'seed@test.invalid', '50000000-0000-0000-0000-000000000051', true);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('91110000-0000-0000-0000-000000000001', 'Unpaid Game',  now() + interval '7 days', 10, 200, 'published'),
  ('92220000-0000-0000-0000-000000000002', 'Paid Game',    now() + interval '8 days', 10, 200, 'published'),
  ('93330000-0000-0000-0000-000000000003', 'Past Game',    now() + interval '9 days', 10, 200, 'published'),
  ('94440000-0000-0000-0000-000000000004', 'Partial Game', now() + interval '9 days', 10, 200, 'published'),
  ('95550000-0000-0000-0000-000000000005', 'Cap One',      now() + interval '9 days', 1,  200, 'published'),
  ('96660000-0000-0000-0000-000000000006', 'Seed Game',    now() + interval '9 days', 10, 200, 'published'),
  ('97770000-0000-0000-0000-000000000007', 'Cross Game',   now() + interval '9 days', 10, 200, 'published');

-- =============================================================================
-- authorization
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('97770000-0000-0000-0000-000000000007', 'cash');
reset role;

-- Player B tries to cancel player A's booking.
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok_probe(
  $q$select public.cancel_booking(
    pg_temp.booking_id_for('97770000-0000-0000-0000-000000000007'))$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'cancelling another player''s booking is rejected (attacker knows the id)');
reset role;

-- The weaker path is worth pinning too: without the id, RLS alone already
-- stops the lookup, so the attack does not even get as far as the function.
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '97770000-0000-0000-0000-000000000007') = 0,
  'player B cannot even see player A''s booking row through RLS');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '97770000-0000-0000-0000-000000000007') = 'reserved',
  'the target booking''s status is unchanged after the rejected cancel');

-- =============================================================================
-- window enforcement
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('93330000-0000-0000-0000-000000000003', 'cash');
reset role;

-- Simulate the game having kicked off (see header note).
update public.games set starts_at = now() - interval '1 hour'
 where id = '93330000-0000-0000-0000-000000000003';

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok_probe(
  $q$select public.cancel_booking(
    (select id from public.bookings where game_id = '93330000-0000-0000-0000-000000000003'))$q$,
  'raise:CANCEL_WINDOW_CLOSED',
  'cancelling after starts_at raises CANCEL_WINDOW_CLOSED');
reset role;

-- A terminal game status also closes the window.
update public.games set starts_at = now() + interval '9 days', status = 'played'
 where id = '93330000-0000-0000-0000-000000000003';

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok_probe(
  $q$select public.cancel_booking(
    (select id from public.bookings where game_id = '93330000-0000-0000-0000-000000000003'))$q$,
  'raise:CANCEL_WINDOW_CLOSED',
  'cancelling on a played game raises CANCEL_WINDOW_CLOSED');
reset role;

-- =============================================================================
-- credit issuance — money actually applied
-- =============================================================================

-- --- unpaid reserved: no credit ---------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('91110000-0000-0000-0000-000000000001', 'cash');
select public.cancel_booking(
  (select id from public.bookings where game_id = '91110000-0000-0000-0000-000000000001'));
reset role;

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where booking_id = (select id from public.bookings
                         where game_id = '91110000-0000-0000-0000-000000000001')) = 0,
  'cancelling an UNPAID reserved booking issues no credit_ledger row');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '91110000-0000-0000-0000-000000000001'
      and event_type = 'credit_issued') = 0,
  'and emits no credit_issued event');

-- --- cash-PAID confirmed: credit equals the full price -----------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('92220000-0000-0000-0000-000000000002', 'cash');
reset role;

-- Fixture manipulation: stand in for Phase 7's confirm_booking (header note).
update public.bookings set status = 'confirmed'
 where game_id = '92220000-0000-0000-0000-000000000002';

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  (select (public.cancel_booking(
    (select id from public.bookings where game_id = '92220000-0000-0000-0000-000000000002')
  )).credit_issued_czk) = 200,
  'cancelling a CASH-PAID confirmed booking issues 200 credit — cash counts like QR');
reset role;

select pg_temp.ok(
  (select delta_czk from public.credit_ledger
    where booking_id = (select id from public.bookings
                         where game_id = '92220000-0000-0000-0000-000000000002')) = 200,
  'the ledger row is +200 with reason cancellation_credit');

select pg_temp.ok(
  (select reason from public.credit_ledger
    where booking_id = (select id from public.bookings
                         where game_id = '92220000-0000-0000-0000-000000000002')) = 'cancellation_credit',
  'the credit reason is cancellation_credit, not a refund of any kind');

-- --- reserved with partial credit applied: only the applied credit comes back
insert into public.credit_ledger (player_id, delta_czk, reason) values
  ('bbbb0000-0000-0000-0000-00000000000b', 50, 'admin_grant');

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('94440000-0000-0000-0000-000000000004', 'qr');
select pg_temp.ok(
  (select (public.cancel_booking(
    (select id from public.bookings where game_id = '94440000-0000-0000-0000-000000000004')
  )).credit_issued_czk) = 50,
  'cancelling a RESERVED booking with partial credit returns only the 50 applied, not the 200 price');
reset role;

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
    where player_id = 'bbbb0000-0000-0000-0000-00000000000b') = 50,
  'player B''s balance is restored to exactly the original 50',
  'balance=' || (select coalesce(sum(delta_czk), 0) from public.credit_ledger
                  where player_id = 'bbbb0000-0000-0000-0000-00000000000b'));

-- --- seed_free: nothing was ever applied, so nothing comes back --------------
select pg_temp.act_as('50000000-0000-0000-0000-000000000051');
select public.create_booking('96660000-0000-0000-0000-000000000006', 'cash');
select pg_temp.ok(
  (select (public.cancel_booking(
    (select id from public.bookings where game_id = '96660000-0000-0000-0000-000000000006')
  )).credit_issued_czk) = 0,
  'cancelling a seed_free booking issues 0 credit (no money was ever applied)');
reset role;

-- =============================================================================
-- transition, lead hours, events, capacity release
-- =============================================================================

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '91110000-0000-0000-0000-000000000001') = 'cancelled',
  'the booking transitions to cancelled');

select pg_temp.ok(
  (select cancel_lead_hours from public.bookings
    where game_id = '91110000-0000-0000-0000-000000000001') between 167 and 169,
  'cancel_lead_hours is recorded (~168h for a game 7 days out)',
  'lead=' || (select cancel_lead_hours::text from public.bookings
               where game_id = '91110000-0000-0000-0000-000000000001'));

-- All three event rows after ONE cancel transaction.
select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '92220000-0000-0000-0000-000000000002'
      and event_type in ('booking_cancelled', 'credit_issued', 'spot_released')) = 3,
  'booking_cancelled + credit_issued + spot_released all present after one cancel',
  (select string_agg(event_type, ', ' order by event_type) from public.events
    where game_id = '92220000-0000-0000-0000-000000000002'
      and event_type in ('booking_cancelled', 'credit_issued', 'spot_released')));

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '91110000-0000-0000-0000-000000000001'
      and event_type = 'spot_released') = 1,
  'spot_released is emitted even when no credit is issued');

-- --- capacity release flips full -> published --------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('95550000-0000-0000-0000-000000000005', 'cash');
reset role;

select pg_temp.ok(
  (select status from public.games where id = '95550000-0000-0000-0000-000000000005') = 'full',
  'the capacity-1 game is full after one booking');

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.cancel_booking(
  (select id from public.bookings where game_id = '95550000-0000-0000-0000-000000000005'));
reset role;

select pg_temp.ok(
  (select status from public.games where id = '95550000-0000-0000-0000-000000000005') = 'published',
  'cancelling flips the game back full -> published');

-- --- a cancelled booking cannot be cancelled again ---------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok_probe(
  $q$select public.cancel_booking(
    (select id from public.bookings where game_id = '95550000-0000-0000-0000-000000000005'))$q$,
  'raise:INVALID_TRANSITION',
  'double-cancelling raises INVALID_TRANSITION');
reset role;

-- --- rebooking after cancelling is possible ----------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok_probe(
  $q$select public.create_booking('95550000-0000-0000-0000-000000000005', 'cash')$q$,
  'rows:1',
  'the freed spot can be rebooked');
reset role;

-- =============================================================================
-- ledger integrity
-- =============================================================================

select pg_temp.ok(
  not exists (select 1 from public.credit_ledger group by player_id having sum(delta_czk) < 0),
  'no player''s ledger sums below zero anywhere in this run');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
