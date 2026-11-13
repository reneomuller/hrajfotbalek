-- =============================================================================
-- A GAME'S PITCH COST FOLLOWS ITS VENUE UNTIL IT IS PLAYED (2026-11-13).
--
-- The owner: "the pitch cost shows correctly in the venue where you can write
-- its value but gets written wrong in other places, for example the admin
-- finances section, where it keeps showing the placeholder value of 1200 per
-- pitch". Every game stored the price of the moment it was made — the games
-- that existed when the feature landed all took the 1200 default — and editing
-- a venue changed only games made afterwards.
--
--   * repricing a venue reprices its games that have not finished
--   * flipping the season reprices every venue's games that have not finished
--   * a finished game keeps what it cost; a cost typed by hand always wins
--
-- Run:  node supabase/tests/run.mjs pitch_cost_follows_venue
-- =============================================================================
begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, coalesce(cond, false), detail);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.cost(p_game uuid)
returns integer language sql as $$
  select cost_czk from public.game_pitch_costs where game_id = p_game
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('42460000-0000-0000-0000-000000000001', 'r42f-admin@test.invalid');
insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('4e460000-0000-0000-0000-000000000001', 'R42FAdmin', 'r42f-admin@test.invalid',
   '42460000-0000-0000-0000-000000000001', true);

insert into public.venues (id, name) values
  ('94246000-0000-0000-0000-0000000000c1', 'R42F Pitch'),
  ('94246000-0000-0000-0000-0000000000c2', 'R42F Other');

select pg_temp.act_as('42460000-0000-0000-0000-000000000001');
select public.set_pitch_season('winter');
reset role;

-- Every game made at the default 1200 (winter).
insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes) values
  -- ahead
  ('94246000-0000-0000-0000-0000000000a1', 'R42F Pitch', '94246000-0000-0000-0000-0000000000c1',
   now() + interval '3 days', 14, 180, 'published', 90),
  -- ahead, its cost typed by hand below
  ('94246000-0000-0000-0000-0000000000a2', 'R42F Pitch', '94246000-0000-0000-0000-0000000000c1',
   now() + interval '4 days', 14, 180, 'published', 90),
  -- on right now: kicked off half an hour ago, ninety minutes long
  ('94246000-0000-0000-0000-0000000000a3', 'R42F Pitch', '94246000-0000-0000-0000-0000000000c1',
   now() - interval '30 minutes', 14, 180, 'full', 90),
  -- finished three hours ago, the sweep not yet round
  ('94246000-0000-0000-0000-0000000000a4', 'R42F Pitch', '94246000-0000-0000-0000-0000000000c1',
   now() - interval '3 hours', 14, 180, 'full', 90),
  -- played last week
  ('94246000-0000-0000-0000-0000000000a5', 'R42F Pitch', '94246000-0000-0000-0000-0000000000c1',
   now() - interval '7 days', 14, 180, 'played', 90),
  -- ahead, at the other venue
  ('94246000-0000-0000-0000-0000000000b1', 'R42F Other', '94246000-0000-0000-0000-0000000000c2',
   now() + interval '3 days', 14, 180, 'published', 90);

select pg_temp.act_as('42460000-0000-0000-0000-000000000001');
select public.set_game_pitch_cost('94246000-0000-0000-0000-0000000000a2', 999);
reset role;

-- =============================================================================
-- REPRICING A VENUE
-- =============================================================================

select pg_temp.act_as('42460000-0000-0000-0000-000000000001');
select public.set_venue_pitch_costs('94246000-0000-0000-0000-0000000000c1', 800, 1500);
reset role;

select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a1') = 1500,
  'a game ahead takes the venue''s new price',
  coalesce(pg_temp.cost('94246000-0000-0000-0000-0000000000a1')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a3') = 1500,
  'and so does a game on right now — it is not played until it finishes',
  coalesce(pg_temp.cost('94246000-0000-0000-0000-0000000000a3')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a2') = 999,
  'a cost typed by hand is left alone');
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a4') = 1200,
  'a game that has finished keeps what it cost, swept or not',
  coalesce(pg_temp.cost('94246000-0000-0000-0000-0000000000a4')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a5') = 1200,
  'and so does a game played last week');
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000b1') = 1200,
  'another venue''s games are not touched');

-- =============================================================================
-- FLIPPING THE SEASON
-- =============================================================================

select pg_temp.act_as('42460000-0000-0000-0000-000000000001');
select public.set_pitch_season('summer');
reset role;

select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a1') = 800,
  'summer: a game ahead takes its venue''s summer price',
  coalesce(pg_temp.cost('94246000-0000-0000-0000-0000000000a1')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000b1') = 800,
  'at every venue',
  coalesce(pg_temp.cost('94246000-0000-0000-0000-0000000000b1')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a2') = 999,
  'a hand-typed cost survives the season too');
select pg_temp.ok(pg_temp.cost('94246000-0000-0000-0000-0000000000a5') = 1200,
  'a played game keeps its cost through the season too');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
