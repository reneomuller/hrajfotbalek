-- =============================================================================
-- Phase 3-4 assertions — constraints, indexes and the variable-symbol sequence
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/03_constraints_and_vs_sequence.sql
--
-- Transaction-wrapped and rolled back, with ONE deliberate exception noted
-- below: sequence advancement is non-transactional, so the VS assertions
-- permanently consume two variable symbols. That is harmless (the sequence is
-- 8 digits and symbols are allowed to have gaps) but it is real, and it is why
-- those two draws are the only side effect this suite leaves behind.
-- =============================================================================

begin;

-- --- harness -----------------------------------------------------------------

create temp table _results (
  seq serial primary key,
  label text,
  passed boolean,
  detail text
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
  when others then return 'error:' || sqlstate;
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'player-a@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'TestPlayerA', 'player-a@test.invalid', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('22220000-0000-0000-0000-000000000002', 'Published Venue', now() + interval '8 days', 12, 200, 'published');

-- =============================================================================
-- players.nickname format CHECK
-- =============================================================================

select pg_temp.ok(
  pg_temp.probe($q$insert into public.players (nickname) values ('bad*name!') returning 1$q$) = 'error:23514',
  'nickname CHECK rejects "bad*name!"',
  pg_temp.probe($q$insert into public.players (nickname) values ('bad*name!') returning 1$q$));

select pg_temp.ok(
  pg_temp.probe($q$insert into public.players (nickname) values ('Player_1') returning 1$q$) = 'rows:1',
  'nickname CHECK accepts "Player_1"');

select pg_temp.ok(
  pg_temp.probe($q$insert into public.players (nickname) values ('ThisNicknameIsWayTooLongToPass') returning 1$q$) = 'error:23514',
  'nickname CHECK rejects a 30-character nickname (max 20)');

-- =============================================================================
-- bookings — one active booking per (game, player)
--
-- The partial unique index is the LAST-LINE backstop behind the advisory locks
-- in create_booking, not the primary mechanism. It must reject a second
-- active row while still permitting a rebook after cancellation.
-- =============================================================================

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk) values
  ('bbbb0000-0000-0000-0000-0000000000a1', '22220000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200);

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200) returning 1$q$) = 'error:23505',
  'a second RESERVED booking for the same (game, player) is rejected',
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200) returning 1$q$));

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a', 'confirmed', 'cash', 200) returning 1$q$) = 'error:23505',
  'a CONFIRMED booking alongside a RESERVED one for the same pair is also rejected');

-- Cancel the first, then rebooking must succeed: the index covers only the
-- active statuses, so a cancelled row does not block a fresh booking.
update public.bookings set status = 'cancelled'
  where id = 'bbbb0000-0000-0000-0000-0000000000a1';

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200) returning 1$q$) = 'rows:1',
  'rebooking succeeds once the previous booking is cancelled');

-- =============================================================================
-- waitlist — one entry per (game, player)
-- =============================================================================

insert into public.waitlist (game_id, player_id) values
  ('22220000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a');

select pg_temp.ok(
  pg_temp.probe($q$insert into public.waitlist (game_id, player_id)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a') returning 1$q$) = 'error:23505',
  'a second waitlist entry for the same (game, player) is rejected',
  pg_temp.probe($q$insert into public.waitlist (game_id, player_id)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a') returning 1$q$));

-- =============================================================================
-- variable-symbol sequence
--
-- NOTE: these two draws are NOT rolled back. Sequences are non-transactional
-- by design, which is exactly the property that makes a variable symbol safe
-- to hand to a bank.
-- =============================================================================

create temp table _vs (n integer, code bigint) on commit drop;
insert into _vs values (1, public.next_payment_code()), (2, public.next_payment_code());

select pg_temp.ok(
  (select count(distinct code) from _vs) = 2,
  'two successive VS draws return different values',
  (select string_agg(code::text, ', ' order by n) from _vs));

select pg_temp.ok(
  (select bool_and(code::text ~ '^26[0-9]{8}$') from _vs),
  'every VS renders as "26" + 8 zero-padded digits (10 chars total)',
  (select string_agg(code::text, ', ' order by n) from _vs));

select pg_temp.ok(
  (select bool_and(length(code::text) = 10) from _vs),
  'every VS is exactly 10 characters long');

select pg_temp.ok(
  (select max(code) from _vs) > (select min(code) from _vs),
  'the VS sequence advances monotonically (never reuses a lower value)');

-- Only QR bookings may carry a variable symbol.
--
-- Deliberately on a SECOND game with the same player: on the first game the
-- partial unique index would fire first and the assertion would pass on a
-- unique violation rather than on the payment_code CHECK it is meant to test.
-- Asserting the exact SQLSTATE (23514) rather than "any error" pins that down.
insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('88880000-0000-0000-0000-000000000008', 'QR Check Venue', now() + interval '11 days', 12, 200, 'published');

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk, payment_code)
                   values ('88880000-0000-0000-0000-000000000008',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200, 2699999999) returning 1$q$) = 'error:23514',
  'a non-QR booking carrying a payment_code is rejected by the CHECK',
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk, payment_code)
                   values ('88880000-0000-0000-0000-000000000008',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'cash', 200, 2699999999) returning 1$q$));

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, status, payment_method, price_czk, payment_code)
                   values ('88880000-0000-0000-0000-000000000008',
                           'a0000000-0000-0000-0000-00000000000a', 'reserved', 'qr', 200, 2699999999) returning 1$q$) = 'rows:1',
  'the same booking as QR, carrying the same payment_code, is accepted');

-- =============================================================================
-- indexes the later phases depend on
-- =============================================================================

select pg_temp.ok(
  to_regclass('public.bookings_one_active_per_player_per_game') is not null,
  'partial unique index bookings_one_active_per_player_per_game exists');

select pg_temp.ok(
  to_regclass('public.bookings_status_expires_at_idx') is not null,
  'index (status, expires_at) exists for the Phase 19 expiry sweep');

select pg_temp.ok(
  to_regclass('public.bookings_game_id_payment_code_idx') is not null,
  'index (game_id, payment_code) exists for the Phase 22 pending list');

select pg_temp.ok(
  to_regclass('public.events_event_type_created_at_idx') is not null,
  'index (event_type, created_at) exists for the Phase 26 stats queries');

-- The cron idempotency guards.
select pg_temp.ok(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name in ('nudge_sent_at', 'reminder_sent_at')) = 2,
  'bookings carries nudge_sent_at and reminder_sent_at');

-- =============================================================================
-- execute privilege on next_payment_code (migration 3)
--
-- Calling this burns a symbol, so it is a write in effect even though it
-- returns a scalar. anon and authenticated must not be able to advance it.
-- =============================================================================

set local role anon;
select pg_temp.ok(
  pg_temp.probe('select public.next_payment_code()') = 'denied',
  'anon cannot call next_payment_code()',
  pg_temp.probe('select public.next_payment_code()'));
reset role;

set local role authenticated;
select pg_temp.ok(
  pg_temp.probe('select public.next_payment_code()') = 'denied',
  'authenticated cannot call next_payment_code()',
  pg_temp.probe('select public.next_payment_code()'));
reset role;

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
