-- =============================================================================
-- Phase 15 assertions — the roster view after the photo_path widening
--
-- Run:  node supabase/tests/run.mjs roster_photo_path
--
-- Transaction-wrapped and rolled back.
--
-- `04_game_roster_public.sql` proves what the view admitted BEFORE Phase 15
-- and still runs unchanged. This suite exists to prove the widening did what
-- it claimed and no more: one column crossed, and the boundary that made the
-- view safe is where it was.
--
-- WRITTEN AGAINST `anon` SPECIFICALLY, because anon is the threat model. The
-- view is `security_invoker = false` and bypasses the RLS on `bookings`,
-- `players` and `games`; its projection and its game-status filter are the
-- only enforcement there is.
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000f151', 'roster-photo@test.invalid');

insert into public.players (id, nickname, email, phone, auth_user_id, photo_path) values
  ('aaaa0000-0000-0000-0000-00000000f151', 'PhotoPlayer', 'roster-photo@test.invalid',
   '+420777000151', 'a0000000-0000-0000-0000-00000000f151', 'players/aaaa0000-0000-0000-0000-00000000f151.jpg'),
  ('bbbb0000-0000-0000-0000-00000000f152', 'NoPhotoPlayer', 'roster-nophoto@test.invalid',
   '+420777000152', null, null);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('cccc0000-0000-0000-0000-00000000f151', 'Photo Pitch', now() + interval '3 days', 12, 200, 'published'),
  ('cccc0000-0000-0000-0000-00000000f152', 'Draft Pitch', now() + interval '3 days', 12, 200, 'draft');

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk) values
  ('dddd0000-0000-0000-0000-00000000f151', 'cccc0000-0000-0000-0000-00000000f151',
   'aaaa0000-0000-0000-0000-00000000f151', 'confirmed', 'cash', 200),
  ('dddd0000-0000-0000-0000-00000000f152', 'cccc0000-0000-0000-0000-00000000f151',
   'bbbb0000-0000-0000-0000-00000000f152', 'reserved', 'cash', 200),
  -- On the DRAFT game, so the status filter has something to withhold.
  ('dddd0000-0000-0000-0000-00000000f153', 'cccc0000-0000-0000-0000-00000000f152',
   'aaaa0000-0000-0000-0000-00000000f151', 'confirmed', 'cash', 200);

-- =============================================================================
-- The widening itself
-- =============================================================================

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

select pg_temp.ok_call(
  $q$select photo_path from public.game_roster_public
     where nickname = 'PhotoPlayer' and game_id = 'cccc0000-0000-0000-0000-00000000f151'$q$,
  'players/aaaa0000-0000-0000-0000-00000000f151.jpg',
  'anon reads photo_path for a player who has one');

select pg_temp.ok_call(
  $q$select photo_path from public.game_roster_public
     where nickname = 'NoPhotoPlayer' and game_id = 'cccc0000-0000-0000-0000-00000000f151'$q$,
  'null',
  'a player with no photo projects NULL — the initials fallback, not an absent row');

-- =============================================================================
-- What did NOT cross, restated after the widening
--
-- This is the assertion the ruling turns on. "We only added one column" is a
-- statement about intent; these are statements about the view.
-- =============================================================================

select pg_temp.ok_call(
  $q$select player_id from public.game_roster_public limit 1$q$,
  'no such column',
  'the view still projects no player_id');

select pg_temp.ok_call(
  $q$select email from public.game_roster_public limit 1$q$,
  'no such column',
  'the view still projects no email');

select pg_temp.ok_call(
  $q$select phone from public.game_roster_public limit 1$q$,
  'no such column',
  'the view still projects no phone');

-- The exhaustive form: every column, named, IN ORDER. A future widening has to
-- edit this line, which is the point — it cannot happen quietly. `games_played`
-- (migration 39) is appended last because `create or replace view` can only
-- append, which is also what keeps the first four at their existing positions
-- for any `select *`.
select pg_temp.ok(
  (select array_agg(attname::text order by attnum)
     from pg_attribute
    where attrelid = 'public.game_roster_public'::regclass
      and attnum > 0 and not attisdropped)
    = array['game_id', 'nickname', 'photo_path', 'games_played'],
  'the view projects exactly these four columns and no fifth');

-- =============================================================================
-- The status filter, which the widening must not have disturbed
-- =============================================================================

select pg_temp.ok_call(
  $q$select count(*) from public.game_roster_public
     where game_id = 'cccc0000-0000-0000-0000-00000000f152'$q$,
  '0',
  'a draft game exposes no roster row, and therefore no photo path either');

select pg_temp.ok_call(
  $q$select count(*) from public.game_roster_public
     where game_id = 'cccc0000-0000-0000-0000-00000000f151'$q$,
  '2',
  'the published game still exposes both its active bookings');

-- A photo path is reachable through the roster ONLY for a game the roster is
-- public on. Stated as its own assertion because it is the property a player
-- is actually relying on when they upload.
select pg_temp.ok_call(
  $q$select count(*) from public.game_roster_public
     where photo_path is not null
       and game_id = 'cccc0000-0000-0000-0000-00000000f152'$q$,
  '0',
  'no photo path leaks through a game that is not publicly visible');

reset role;

-- =============================================================================
-- `players` itself is unchanged — the view is the only new exit
-- =============================================================================

-- Denied outright, not merely empty: `players` carries no SELECT grant to anon
-- at all, so the widened view is the ONLY route by which a photo path reaches
-- an anonymous caller. Asserting 'denied' rather than '0' matters — an empty
-- result would also be produced by a grant that existed with restrictive RLS,
-- and those are different amounts of surface.
select set_config('role', 'anon', true);
select pg_temp.ok_call(
  $q$select count(*) from public.players$q$,
  'denied',
  'anon is denied `players` outright — the widened view is the only new exit');
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
