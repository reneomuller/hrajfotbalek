-- =============================================================================
-- Phase 4 assertions — bookings / credit_ledger / waitlist RLS
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/02_rls_bookings_ledger_waitlist.sql
--
-- Transaction-wrapped and rolled back; safe against the live database.
--
-- All three tables grant own-row SELECT to `authenticated` and nothing at all
-- to `anon`, and grant no INSERT/UPDATE/DELETE to either — every write goes
-- through a SECURITY DEFINER RPC. These assertions pin both halves of that:
-- what a signed-in player CAN see (only their own rows) and what nobody can
-- do (write anything, or read as anon).
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
  ('aaaaaaaa-0000-0000-0000-000000000001', 'player-a@test.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'player-b@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'TestPlayerA', 'player-a@test.invalid', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'TestPlayerB', 'player-b@test.invalid', 'bbbbbbbb-0000-0000-0000-000000000002');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('22220000-0000-0000-0000-000000000002', 'Published Venue', now() + interval '8 days', 12, 200, 'published');

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk) values
  ('bbbb0000-0000-0000-0000-0000000000a1', '22220000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'confirmed', 'cash', 200),
  ('bbbb0000-0000-0000-0000-0000000000b1', '22220000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'confirmed', 'cash', 200);

insert into public.credit_ledger (id, player_id, delta_czk, reason) values
  ('ccc00000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 150, 'admin_grant'),
  ('ccc00000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 250, 'admin_grant');

-- Two distinct games so the waitlist unique constraint is not in play here.
insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('77770000-0000-0000-0000-000000000007', 'Waitlist Venue', now() + interval '10 days', 1, 200, 'full');

insert into public.waitlist (game_id, player_id) values
  ('77770000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-00000000000a'),
  ('77770000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-00000000000b');

-- =============================================================================
-- ANON — no grant on any of the three
-- =============================================================================

set local role anon;

select pg_temp.ok(pg_temp.probe('select * from public.bookings') = 'denied',
  'anon cannot read bookings', pg_temp.probe('select * from public.bookings'));

select pg_temp.ok(pg_temp.probe('select * from public.credit_ledger') = 'denied',
  'anon cannot read credit_ledger', pg_temp.probe('select * from public.credit_ledger'));

select pg_temp.ok(pg_temp.probe('select * from public.waitlist') = 'denied',
  'anon cannot read waitlist', pg_temp.probe('select * from public.waitlist'));

reset role;

-- =============================================================================
-- AUTHENTICATED as player A — own rows only
-- =============================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.ok((select count(*) from public.bookings) = 1,
  'player A reads exactly their own booking',
  'count=' || (select count(*) from public.bookings));

select pg_temp.ok(
  (select player_id from public.bookings) = 'a0000000-0000-0000-0000-00000000000a',
  'the booking player A reads is their own; player B''s is invisible');

select pg_temp.ok((select count(*) from public.credit_ledger) = 1
                  and (select sum(delta_czk) from public.credit_ledger) = 150,
  'player A reads only their own ledger rows (balance 150, not 400)',
  'sum=' || coalesce((select sum(delta_czk) from public.credit_ledger)::text, 'null'));

select pg_temp.ok((select count(*) from public.waitlist) = 1,
  'player A reads only their own waitlist entry',
  'count=' || (select count(*) from public.waitlist));

-- --- no client writes anywhere ----------------------------------------------

select pg_temp.ok(
  pg_temp.probe($q$insert into public.bookings (game_id, player_id, payment_method, price_czk)
                   values ('22220000-0000-0000-0000-000000000002',
                           'a0000000-0000-0000-0000-00000000000a', 'cash', 200) returning 1$q$) = 'denied',
  'player A cannot INSERT a booking directly (must go through the RPC)');

select pg_temp.ok(
  pg_temp.probe($q$update public.bookings set status = 'confirmed'
                   where id = 'bbbb0000-0000-0000-0000-0000000000a1' returning 1$q$) = 'denied',
  'player A cannot UPDATE their own booking directly');

-- The wallet's whole integrity rests on the ledger being append-only by
-- privilege rather than by convention.
select pg_temp.ok(
  pg_temp.probe($q$insert into public.credit_ledger (player_id, delta_czk, reason)
                   values ('a0000000-0000-0000-0000-00000000000a', 9999, 'admin_grant') returning 1$q$) = 'denied',
  'player A cannot mint themselves credit (no INSERT on credit_ledger)');

select pg_temp.ok(
  pg_temp.probe($q$update public.credit_ledger set delta_czk = 9999
                   where id = 'ccc00000-0000-0000-0000-0000000000a1' returning 1$q$) = 'denied',
  'credit_ledger UPDATE is revoked (append-only)');

select pg_temp.ok(
  pg_temp.probe($q$delete from public.credit_ledger
                   where id = 'ccc00000-0000-0000-0000-0000000000a1' returning 1$q$) = 'denied',
  'credit_ledger DELETE is revoked (append-only)');

select pg_temp.ok(
  pg_temp.probe($q$insert into public.waitlist (game_id, player_id)
                   values ('77770000-0000-0000-0000-000000000007',
                           'a0000000-0000-0000-0000-00000000000a') returning 1$q$) = 'denied',
  'player A cannot INSERT a waitlist row directly');

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
