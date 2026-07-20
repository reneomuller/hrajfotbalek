-- =============================================================================
-- Phase 3 assertions — players / games / events RLS
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/01_rls_players_games_events.sql
--
-- Self-contained and non-destructive: everything runs inside one transaction
-- that ROLLBACKs at the end, so fixtures never survive the run. Safe against
-- the live database.
--
-- The distinction these assertions turn on:
--   * "denied"  = the role has no GRANT, so Postgres raises insufficient_privilege.
--   * "rows:0"  = the role may read the table, but RLS matched no rows.
-- Both are secure outcomes, but they are different mechanisms and a test that
-- accepts either would pass even if a GRANT were added by accident. Each
-- assertion below names which one it expects.
-- =============================================================================

begin;

-- --- harness -----------------------------------------------------------------

create temp table _results (
  seq serial primary key,
  label text,
  passed boolean,
  detail text
) on commit drop;

-- SECURITY DEFINER so the recorder can still write to the results table while
-- the assertions themselves run as `anon` / `authenticated`, which own nothing.
create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

-- Runs `sql` as the CURRENT role and reports what happened, without aborting
-- the surrounding transaction on a privilege error.
create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  -- A CTE, not a subquery: this wrapper has to accept INSERT/UPDATE ...
  -- RETURNING as well as SELECT, and only a data-modifying CTE allows that.
  execute 'with _p as (' || sql || ') select count(*) from _p' into n;
  return 'rows:' || n;
exception
  when insufficient_privilege then return 'denied';
  when others then return 'error:' || sqlstate;
end $$;

-- --- fixtures (created as the migration owner, which bypasses RLS) -----------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'player-a@test.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'player-b@test.invalid');

insert into public.players (id, nickname, email, phone, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'TestPlayerA', 'player-a@test.invalid', '+420111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'TestPlayerB', 'player-b@test.invalid', '+420222222222', 'bbbbbbbb-0000-0000-0000-000000000002'),
  -- Shadow: no auth_user_id. Nobody's session can ever match this row.
  ('c0000000-0000-0000-0000-00000000000c', 'TestShadowC', null, '+420333333333', null);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('11110000-0000-0000-0000-000000000001', 'Draft Venue',     now() + interval '7 days', 12, 200, 'draft'),
  ('22220000-0000-0000-0000-000000000002', 'Published Venue', now() + interval '8 days', 12, 200, 'published'),
  ('33330000-0000-0000-0000-000000000003', 'Full Venue',      now() + interval '9 days', 12, 200, 'full'),
  ('44440000-0000-0000-0000-000000000004', 'Played Venue',    now() - interval '2 days', 12, 200, 'played'),
  ('55550000-0000-0000-0000-000000000005', 'Settled Venue',   now() - interval '3 days', 12, 200, 'settled'),
  ('66660000-0000-0000-0000-000000000006', 'Cancelled Venue', now() + interval '5 days', 12, 200, 'cancelled');

insert into public.events (event_type, player_id, game_id) values
  ('game_published', null, '22220000-0000-0000-0000-000000000002');

-- =============================================================================
-- ANON
-- =============================================================================

set local role anon;

-- players holds PII and has no anon GRANT at all.
select pg_temp.ok(
  pg_temp.probe('select * from public.players') = 'denied',
  'anon cannot read players (no grant -> insufficient_privilege)',
  pg_temp.probe('select * from public.players'));

-- events has neither policy nor grant: no client access whatsoever.
select pg_temp.ok(
  pg_temp.probe('select * from public.events') = 'denied',
  'anon cannot read events',
  pg_temp.probe('select * from public.events'));

select pg_temp.ok(
  pg_temp.probe($q$insert into public.events (event_type) values ('auth_completed') returning 1$q$) = 'denied',
  'anon cannot insert events',
  pg_temp.probe($q$insert into public.events (event_type) values ('auth_completed') returning 1$q$));

-- games IS anon-readable, but only the four public statuses.
select pg_temp.ok(
  (select count(*) from public.games) = 4,
  'anon sees exactly the 4 public-status games',
  'count=' || (select count(*) from public.games));

select pg_temp.ok(
  not exists (select 1 from public.games where status in ('draft', 'cancelled')),
  'anon sees no draft or cancelled game');

select pg_temp.ok(
  (select count(*) from public.games where status in ('published','full','played','settled')) = 4,
  'anon sees published, full, played and settled');

reset role;

-- =============================================================================
-- AUTHENTICATED as player A
-- =============================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.ok(
  (select count(*) from public.players) = 1,
  'player A reads exactly one players row',
  'count=' || (select count(*) from public.players));

select pg_temp.ok(
  (select nickname from public.players) = 'TestPlayerA',
  'the row player A reads is their own');

select pg_temp.ok(
  not exists (select 1 from public.players where nickname in ('TestPlayerB', 'TestShadowC')),
  'player A cannot read player B or the shadow player (cross-user read blocked)');

-- The column-scoped UPDATE grant: nickname is writable, is_admin is not.
-- Without the column grant, the own-row USING clause alone would have let a
-- player elevate themselves.
select pg_temp.ok(
  pg_temp.probe($q$update public.players set nickname = 'RenamedA'
                   where auth_user_id = auth.uid() returning 1$q$) = 'rows:1',
  'player A may update their own nickname');

select pg_temp.ok(
  pg_temp.probe($q$update public.players set is_admin = true
                   where auth_user_id = auth.uid() returning 1$q$) = 'denied',
  'player A cannot self-grant is_admin (no column privilege)',
  pg_temp.probe($q$update public.players set is_admin = true
                   where auth_user_id = auth.uid() returning 1$q$));

select pg_temp.ok(
  pg_temp.probe($q$update public.players set nickname = 'HijackedB'
                   where nickname = 'TestPlayerB' returning 1$q$) = 'rows:0',
  'player A updating player B matches no row (RLS, not privilege)',
  pg_temp.probe($q$update public.players set nickname = 'HijackedB'
                   where nickname = 'TestPlayerB' returning 1$q$));

select pg_temp.ok(
  pg_temp.probe('select * from public.events') = 'denied',
  'authenticated cannot read events either');

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
