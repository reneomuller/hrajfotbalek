-- =============================================================================
-- Phase 4 assertions — game_roster_public
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/04_game_roster_public.sql
--
-- Transaction-wrapped and rolled back; safe against the live database.
--
-- This view is the ONLY anonymous read path into booking data and the single
-- highest-risk PII surface in the system. Being SECURITY DEFINER it bypasses
-- the RLS on `bookings`, `players` and `games`, so its projection and its
-- game-status filter are the sole enforcement points — there is no second
-- line of defence behind it. These assertions are therefore written against
-- the ANON role specifically, since anon is the threat model.
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

-- --- fixtures: one booking on a game of every status -------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'player-a@test.invalid');

insert into public.players (id, nickname, email, phone, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'RosterPlayerA', 'player-a@test.invalid', '+420111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'RosterPlayerB', 'player-b@test.invalid', '+420222222222', null);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('11110000-0000-0000-0000-000000000001', 'Draft Venue',     now() + interval '7 days', 12, 200, 'draft'),
  ('22220000-0000-0000-0000-000000000002', 'Published Venue', now() + interval '8 days', 12, 200, 'published'),
  ('33330000-0000-0000-0000-000000000003', 'Full Venue',      now() + interval '9 days', 12, 200, 'full'),
  ('44440000-0000-0000-0000-000000000004', 'Played Venue',    now() - interval '2 days', 12, 200, 'played'),
  ('55550000-0000-0000-0000-000000000005', 'Settled Venue',   now() - interval '3 days', 12, 200, 'settled'),
  ('66660000-0000-0000-0000-000000000006', 'Cancelled Venue', now() + interval '5 days', 12, 200, 'cancelled');

-- One confirmed booking per game, all for player A.
insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
select g.id, 'a0000000-0000-0000-0000-00000000000a', 'confirmed', 'cash', 200
from public.games g;

-- On the published game, add a cancelled and an expired booking for player B:
-- neither is a spot in the lineup and neither may appear in the roster.
insert into public.bookings (game_id, player_id, status, payment_method, price_czk) values
  ('22220000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'cancelled', 'cash', 200);

-- =============================================================================
-- projection — as ANON
-- =============================================================================

set local role anon;

select pg_temp.ok(
  (select array_agg(column_name::text order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roster_public')
  = array['game_id', 'nickname', 'status'],
  'the view projects EXACTLY game_id, nickname, status',
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roster_public'));

select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
       and column_name in ('player_id', 'email', 'phone', 'id', 'auth_user_id')),
  'the view exposes no player_id, email, phone, id or auth_user_id');

-- =============================================================================
-- game-status filter — the enforcement point that must live in the view body
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '11110000-0000-0000-0000-000000000001') = 0,
  'a DRAFT game returns zero roster rows',
  'count=' || (select count(*) from public.game_roster_public
                where game_id = '11110000-0000-0000-0000-000000000001'));

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '66660000-0000-0000-0000-000000000006') = 0,
  'a CANCELLED game returns zero roster rows',
  'count=' || (select count(*) from public.game_roster_public
                where game_id = '66660000-0000-0000-0000-000000000006'));

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '22220000-0000-0000-0000-000000000002') = 1,
  'a PUBLISHED game returns its active roster');

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id in ('22220000-0000-0000-0000-000000000002',
                      '33330000-0000-0000-0000-000000000003',
                      '44440000-0000-0000-0000-000000000004',
                      '55550000-0000-0000-0000-000000000005')) = 4,
  'published, full, played and settled games all return rows');

-- Scoped to this file's fixture games: a global count(*) over the view passed
-- only against an empty database and broke as soon as `npm run seed` existed.
select pg_temp.ok(
  (select count(*) from public.game_roster_public where game_id in (
     '11110000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000002',
     '33330000-0000-0000-0000-000000000003','44440000-0000-0000-0000-000000000004',
     '55550000-0000-0000-0000-000000000005','66660000-0000-0000-0000-000000000006')) = 4,
  'the view returns rows for the 4 public fixture games and nothing else',
  'count=' || (select count(*) from public.game_roster_public where game_id in (
     '11110000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000002',
     '33330000-0000-0000-0000-000000000003','44440000-0000-0000-0000-000000000004',
     '55550000-0000-0000-0000-000000000005','66660000-0000-0000-0000-000000000006')));

-- =============================================================================
-- booking-status filter
-- =============================================================================

select pg_temp.ok(
  not exists (select 1 from public.game_roster_public where nickname = 'RosterPlayerB'),
  'a cancelled booking does not appear in the roster');

select pg_temp.ok(
  (select bool_and(status in ('reserved', 'confirmed')) from public.game_roster_public),
  'every roster row is an active (reserved/confirmed) booking');

-- =============================================================================
-- the view is genuinely reachable by anon (a denied read would pass the
-- filter assertions above vacuously, which is the failure mode to rule out)
-- =============================================================================

select pg_temp.ok(
  (select nickname from public.game_roster_public
    where game_id = '22220000-0000-0000-0000-000000000002') = 'RosterPlayerA',
  'anon can actually read the view (filters above are not passing vacuously)');

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
