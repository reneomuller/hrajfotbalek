-- =============================================================================
-- v1.2 §5.7 assertions — venue amenities, and the games-played count
--
-- Run:  node supabase/tests/run.mjs venue_amenities
--
-- Transaction-wrapped and rolled back.
--
-- Two migrations, one suite, because they answer one question between them:
-- what the rebuilt game page is allowed to say about a venue and about the
-- people on its roster. `04_game_roster_public.sql` and `roster_photo_path.sql`
-- still hold the PII boundary; this proves the COUNT is right, which is a
-- different claim and the one nobody would notice being wrong.
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
  when undefined_column then return 'no such column';
  when check_violation then return 'check:' || sqlerrm;
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000038a1', 'amen-admin@test.invalid'),
  ('a0000000-0000-0000-0000-0000000038a2', 'amen-player@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('b0000000-0000-0000-0000-0000000038a1', 'AmenAdmin', 'amen-admin@test.invalid',
   'a0000000-0000-0000-0000-0000000038a1', true),
  ('b0000000-0000-0000-0000-0000000038a2', 'AmenPlayer', 'amen-player@test.invalid',
   'a0000000-0000-0000-0000-0000000038a2', false);

insert into public.venues (id, name) values
  ('c0000000-0000-0000-0000-0000000038a1', 'Amenity Test Pitch');

-- Four games at that venue, in the four statuses that decide whether a booking
-- counts. `games_played` must count the played and settled ones and neither of
-- the others.
insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status) values
  ('d0000000-0000-0000-0000-00000000381a', 'Amenity Test Pitch',
   'c0000000-0000-0000-0000-0000000038a1', now() + interval '7 days', 12, 150, 'published'),
  ('d0000000-0000-0000-0000-00000000382a', 'Amenity Test Pitch',
   'c0000000-0000-0000-0000-0000000038a1', now() - interval '7 days', 12, 150, 'played'),
  ('d0000000-0000-0000-0000-00000000383a', 'Amenity Test Pitch',
   'c0000000-0000-0000-0000-0000000038a1', now() - interval '14 days', 12, 150, 'settled'),
  ('d0000000-0000-0000-0000-00000000384a', 'Amenity Test Pitch',
   'c0000000-0000-0000-0000-0000000038a1', now() - interval '21 days', 12, 150, 'cancelled');

insert into public.bookings
  (id, game_id, player_id, status, payment_method, price_czk)
values
  -- Upcoming: a commitment, not a game played.
  ('e0000000-0000-0000-0000-00000000381a', 'd0000000-0000-0000-0000-00000000381a',
   'b0000000-0000-0000-0000-0000000038a2', 'confirmed', 'cash', 150),
  -- Played and settled: these two are the count.
  ('e0000000-0000-0000-0000-00000000382a', 'd0000000-0000-0000-0000-00000000382a',
   'b0000000-0000-0000-0000-0000000038a2', 'confirmed', 'cash', 150),
  ('e0000000-0000-0000-0000-00000000383a', 'd0000000-0000-0000-0000-00000000383a',
   'b0000000-0000-0000-0000-0000000038a2', 'confirmed', 'cash', 150),
  -- Cancelled game: never happened.
  ('e0000000-0000-0000-0000-00000000384a', 'd0000000-0000-0000-0000-00000000384a',
   'b0000000-0000-0000-0000-0000000038a2', 'confirmed', 'cash', 150);

-- =============================================================================
-- games_played — what the number on the lineup actually means
-- =============================================================================

select set_config('role', 'anon', true);

select pg_temp.ok(
  (select games_played from public.game_roster_public
    where game_id = 'd0000000-0000-0000-0000-00000000381a') = 2,
  'games_played counts PLAYED and SETTLED games only');

-- The negative half, stated separately: the upcoming booking this player holds
-- is on the very row being read, so a naive count would include it and read 3.
select pg_temp.ok(
  (select games_played from public.game_roster_public
    where game_id = 'd0000000-0000-0000-0000-00000000381a') <> 3,
  'a booking on the upcoming game does not count itself — the number is games played, not games booked');

reset role;

-- A cancelled game's booking is excluded too, proved by cancelling a settled
-- one and watching the count fall. Direct UPDATE under service_role: this is a
-- state assertion, not a transition, and the RPC path is tested elsewhere.
select pg_temp.as_service();

update public.games set status = 'cancelled'
 where id = 'd0000000-0000-0000-0000-00000000383a';

select set_config('role', 'anon', true);

select pg_temp.ok(
  (select games_played from public.game_roster_public
    where game_id = 'd0000000-0000-0000-0000-00000000381a') = 1,
  'a game that was cancelled stops counting for everyone who had booked it');

reset role;
select pg_temp.as_service();
update public.games set status = 'settled'
 where id = 'd0000000-0000-0000-0000-00000000383a';
reset role;

-- =============================================================================
-- amenities — the catalog, the dedup, and who may write
-- =============================================================================

-- A NEW venue provides nothing until someone says otherwise. The three the
-- product has always promised were BACKFILLED onto the venues that existed
-- when migration 38 ran, which is a one-time move of an existing claim rather
-- than a default that keeps asserting it about pitches nobody has looked at.
select pg_temp.ok(
  (select amenities from public.venues where id = 'c0000000-0000-0000-0000-0000000038a1')
    = array[]::text[],
  'a venue created after the migration claims nothing until an admin says so');

-- The CHECK, hit directly. A value outside the catalog renders as a gap in the
-- grid, so it must not be storable at all.
--
-- Through `do` blocks rather than `ok_call`: that helper wraps its argument as
-- a sub-select and a data-modifying statement cannot be one.
do $$
begin
  update public.venues set amenities = array['helipad']::text[]
   where id = 'c0000000-0000-0000-0000-0000000038a1';
  perform pg_temp.ok(false, 'an amenity outside the catalog is refused');
exception when check_violation then
  perform pg_temp.ok(sqlerrm like '%venues_amenities_catalog%',
    'an amenity outside the catalog is refused');
end $$;

do $$
begin
  update public.venues set amenities = array['bibs', 'bibs']::text[]
   where id = 'c0000000-0000-0000-0000-0000000038a1';
  perform pg_temp.ok(false, 'a duplicated amenity is refused — it would render twice');
exception when check_violation then
  perform pg_temp.ok(sqlerrm like '%venues_amenities_distinct%',
    'a duplicated amenity is refused — it would render twice');
end $$;

-- An empty set is legal and is the state the grid disappears for.
do $$
begin
  update public.venues set amenities = array[]::text[]
   where id = 'c0000000-0000-0000-0000-0000000038a1';
  perform pg_temp.ok(true, 'a venue may provide nothing at all');
exception when others then
  perform pg_temp.ok(false, 'a venue may provide nothing at all', sqlerrm);
end $$;

-- --- set_venue_amenities -----------------------------------------------------

-- act_as takes the AUTH USER id — it becomes the JWT `sub`, which is what
-- `auth.uid()` reads and `is_admin_caller()` joins on.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000038a2');

select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       'c0000000-0000-0000-0000-0000000038a1', array['showers']::text[])$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot say what a pitch provides');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-0000000038a1');

-- DEDUPLICATED AND SORTED, so two admins ticking the same boxes in a different
-- order produce the same row and the grid renders in one stable order.
select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       'c0000000-0000-0000-0000-0000000038a1',
       array['showers', 'bibs', 'showers']::text[])::text$q$,
  '{bibs,showers}',
  'the RPC deduplicates and sorts what it is given');

-- REPLACES RATHER THAN MERGES. This is the assertion the whole design turns on:
-- unticking a box has to be a real operation, because the moment a pitch stops
-- lending gloves is exactly when the page must stop promising them.
select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       'c0000000-0000-0000-0000-0000000038a1', array['parking']::text[])::text$q$,
  '{parking}',
  'saving a smaller set REMOVES what is not in it — unticking is a real operation');

select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       'c0000000-0000-0000-0000-0000000038a1', array['helipad']::text[])$q$,
  'raise:AMENITY_UNKNOWN',
  'the RPC names the failure rather than leaving the CHECK to');

select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       'c0000000-0000-0000-0000-0000000038a1', null)::text$q$,
  '{}',
  'a null set clears rather than erroring — it is how an admin says "nothing"');

select pg_temp.ok_call(
  $q$select public.set_venue_amenities(
       '00000000-0000-0000-0000-000000000000', array['bibs']::text[])$q$,
  'raise:VENUE_NOT_FOUND',
  'a venue that does not exist is named, not silently ignored');

reset role;

-- --- the read path -----------------------------------------------------------
-- The grid renders for a signed-out visitor arriving from a shared link, and a
-- missing grant would return the column as empty rather than erroring.

select pg_temp.as_service();
select public.set_venue_amenities(
  'c0000000-0000-0000-0000-0000000038a1', array['bibs', 'showers']::text[]);
reset role;

select set_config('role', 'anon', true);
select pg_temp.ok_call(
  $q$select amenities::text from public.venues
      where id = 'c0000000-0000-0000-0000-0000000038a1'$q$,
  '{bibs,showers}',
  'anon reads the amenities — the grid renders for a visitor with no account');
reset role;

-- --- results -----------------------------------------------------------------

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
  from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
