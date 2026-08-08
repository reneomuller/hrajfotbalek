-- =============================================================================
-- v1.3 conformance A — players, games, and their constraints
--
-- Run:  node supabase/tests/run.mjs v13_conformance/schema_a
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- WHAT THIS SUITE IS FOR. v1.3 is a front-end round: SCOPE.md §4 forbids a new
-- entity, a new foreign key, a new account state or a schema migration. That
-- makes this suite a CONFORMANCE CHECK rather than a test of new work — it
-- asserts the database already matches the contract the redesign is about to
-- build on, so that a screen is never designed against a column that is not
-- there.
--
-- A probe that fails here is not fixed here. It becomes a line in the
-- conditional additive migration that Phase 7 owns, and that migration is
-- written only on an explicit decision — never as an ad-hoc repair inside a
-- test run.
--
-- THE COUNT(*) TRAP, since this suite depends on not falling into it.
-- `with _p as (…) select count(*) from _p` can pass WITHOUT running the thing
-- it probes: count(*) reads no column, so the planner is free to prune a
-- non-volatile function call straight out of the plan, and the privilege check
-- never runs. `count(_p::text)` forces evaluation. Wrapping the cast in a
-- subquery is not enough — the pruning simply moves up a level.
-- =============================================================================

begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

-- `security definer` so a probe running under `set local role anon` can still
-- record its own result. Without it the suite dies with "permission denied for
-- table _results" the moment it tests an unprivileged read — which is the most
-- interesting thing it does.
create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

-- Does a column exist, and is it nullable as the contract requires?
create function pg_temp.col(tbl text, col text)
returns text language plpgsql as $$
declare v text;
begin
  select case when is_nullable = 'YES' then 'nullable' else 'not null' end
    into v
  from information_schema.columns
  where table_schema = 'public' and table_name = tbl and column_name = col;
  return coalesce(v, 'ABSENT');
end $$;

-- The definition text of a named CHECK constraint, or ABSENT.
create function pg_temp.chk(tbl text, name text)
returns text language plpgsql as $$
declare v text;
begin
  select pg_get_constraintdef(con.oid) into v
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = tbl and con.conname = name;
  return coalesce(v, 'ABSENT');
end $$;

-- Runs a statement and reports how it ENDED, so a rejection is distinguishable
-- from a silent no-op.
create function pg_temp.attempt(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when check_violation then return 'check_violation';
  when insufficient_privilege then return 'denied';
  when others then return 'error:' || sqlstate;
end $$;

-- =============================================================================
-- 0. Negative control — REQ-EH-004
--
-- The suite must be able to FAIL. Every probe below is a pg_temp.col() or
-- pg_temp.chk() lookup, so the whole suite is worth exactly what those two
-- helpers' ability to return ABSENT is worth. If `col()` returned 'nullable'
-- for everything — a plausible way to write it wrong — every probe would pass
-- against an empty database.
--
-- So: assert that a column which certainly does not exist reports ABSENT, and
-- that a CHECK which certainly does not exist reports ABSENT. Both assertions
-- PASS, and together they prove a genuinely missing column would FAIL rather
-- than pass silently.
-- =============================================================================

select pg_temp.ok(
  pg_temp.col('players', 'column_that_does_not_exist') = 'ABSENT',
  'negative control: a nonexistent column reports ABSENT, so a real miss fails');

select pg_temp.ok(
  pg_temp.chk('games', 'constraint_that_does_not_exist') = 'ABSENT',
  'negative control: a nonexistent CHECK reports ABSENT');

select pg_temp.ok(
  pg_temp.col('players', 'nickname') = 'not null',
  'negative control: col() distinguishes nullability (nickname is not null)');

-- =============================================================================
-- 1. players — the v2 columns, every one nullable
--
-- Nullable is the requirement, not an accident. Every one of these was added
-- to a table with live rows; a NOT NULL column would have needed a backfill
-- decision, and the absence of one is what keeps existing players valid.
-- =============================================================================

select pg_temp.ok(pg_temp.col('players', 'country') = 'nullable',
  'players.country exists and is nullable',
  pg_temp.col('players', 'country'));

select pg_temp.ok(pg_temp.col('players', 'skill_level') = 'nullable',
  'players.skill_level exists and is nullable',
  pg_temp.col('players', 'skill_level'));

select pg_temp.ok(pg_temp.col('players', 'tos_accepted_at') = 'nullable',
  'players.tos_accepted_at exists and is nullable',
  pg_temp.col('players', 'tos_accepted_at'));

select pg_temp.ok(pg_temp.col('players', 'tos_version') = 'nullable',
  'players.tos_version exists and is nullable',
  pg_temp.col('players', 'tos_version'));

-- players.skill_level is a SCALAR. See §3 for why the naming distance from
-- games.allowed_skill_levels matters.
select pg_temp.ok(
  (select udt_name from information_schema.columns
    where table_schema = 'public' and table_name = 'players'
      and column_name = 'skill_level') = 'skill_level',
  'players.skill_level is the scalar enum, not an array');

-- =============================================================================
-- 2. games — the v2 columns and their CHECKs
-- =============================================================================

select pg_temp.ok(pg_temp.col('games', 'duration_minutes') = 'nullable',
  'games.duration_minutes exists and is nullable',
  pg_temp.col('games', 'duration_minutes'));

select pg_temp.ok(
  pg_temp.chk('games', 'games_duration_range')
    = 'CHECK (((duration_minutes IS NULL) OR ((duration_minutes >= 30) AND (duration_minutes <= 180))))',
  'games.duration_minutes is bounded 30-180, and NULL is admitted',
  pg_temp.chk('games', 'games_duration_range'));

select pg_temp.ok(pg_temp.col('games', 'allowed_skill_levels') = 'nullable',
  'games.allowed_skill_levels exists and is nullable',
  pg_temp.col('games', 'allowed_skill_levels'));

select pg_temp.ok(
  (select udt_name from information_schema.columns
    where table_schema = 'public' and table_name = 'games'
      and column_name = 'allowed_skill_levels') = '_skill_level',
  'games.allowed_skill_levels is an ARRAY of skill_level');

select pg_temp.ok(pg_temp.col('games', 'subs_per_team') = 'nullable',
  'games.subs_per_team exists and is nullable',
  pg_temp.col('games', 'subs_per_team'));

select pg_temp.ok(
  pg_temp.chk('games', 'games_format_format')
    = 'CHECK (((format IS NULL) OR (format ~ ''^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2})?$''::text)))',
  'games.format CHECK admits an optional third side',
  pg_temp.chk('games', 'games_format_format'));

-- =============================================================================
-- 3. allowed_skill_levels is a SET, and admits two adjacent levels
--
-- This is the data-model fact behind ruling I. The brief asked for "exactly one
-- level per game, never two"; the contract refused, because a game legitimately
-- admits two adjacent levels and "never two" is a schema change wearing a card
-- rule's clothing (SCOPE.md §1).
--
-- Asserted by INSERTING one, not by reading the type. A column can be an array
-- and still be constrained to length 1 by a CHECK nobody remembered.
-- =============================================================================

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.games
      (venue, starts_at, capacity, price_czk, status, city, brand,
       allowed_skill_levels)
    values
      ('conformance-a probe', now() + interval '30 days', 10, 150, 'draft',
       'Praha', 'hrajfotbal',
       array['beginner', 'intermediate']::skill_level[])
  $q$) = 'ok',
  'games.allowed_skill_levels accepts a TWO-element array (ruling I)');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.games
      (venue, starts_at, capacity, price_czk, status, city, brand,
       allowed_skill_levels)
    values
      ('conformance-a probe empty', now() + interval '30 days', 10, 150,
       'draft', 'Praha', 'hrajfotbal', array[]::skill_level[])
  $q$) = 'check_violation',
  'an EMPTY skill set is refused — null means "any", empty means nothing');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.games
      (venue, starts_at, capacity, price_czk, status, city, brand, format)
    values
      ('conformance-a probe 3way', now() + interval '30 days', 18, 150,
       'draft', 'Praha', 'hrajfotbal', '6v6v6')
  $q$) = 'ok',
  'a three-way format (6v6v6) is accepted, so an organizer can state one');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.games
      (venue, starts_at, capacity, price_czk, status, city, brand,
       duration_minutes)
    values
      ('conformance-a probe dur', now() + interval '30 days', 10, 150,
       'draft', 'Praha', 'hrajfotbal', 20)
  $q$) = 'check_violation',
  'a 20-minute duration is refused by games_duration_range');

-- =============================================================================
-- 4. The app-side format regex mirrors the CHECK
--
-- `FORMAT_RE` in lib/admin/gameForm.ts is
--     /^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2})?$/
-- and the CHECK asserted in §2 carries the identical pattern. They are two
-- copies of one rule, and the failure mode of drift is one-sided and quiet:
-- a form that is STRICTER than the CHECK simply refuses formats the database
-- would accept, and reads as "the admin form is broken" rather than as a
-- mismatch. The assertion below pins the CHECK's pattern text so a migration
-- that widens one side without the other fails here.
-- =============================================================================

select pg_temp.ok(
  pg_temp.chk('games', 'games_format_format') like '%^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2})?$%',
  'the CHECK pattern is byte-identical to FORMAT_RE in lib/admin/gameForm.ts');

-- =============================================================================
-- 5. capacity is the sole booking limit
--
-- Neither format nor subs_per_team participates. A game running 6v6v6 with
-- three subs a side is still bounded by `capacity` and nothing else — the
-- other two columns are descriptions an organizer writes, not arithmetic the
-- booking path performs.
--
-- Asserted against the function body, because the alternative — booking a game
-- to capacity — proves the limit works without proving it is the ONLY one.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'create_booking_internal'
      and prosrc ~ 'capacity') = 1,
  'create_booking_internal consults capacity');

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'create_booking_internal'
      and prosrc ~* '(format|subs_per_team|allowed_skill_levels)') = 0,
  'create_booking_internal does NOT consult format, subs_per_team or skill');

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname in ('create_booking', 'create_booking_internal')
      and prosrc ~* 'allowed_skill_levels') = 0,
  'no booking path enforces skill — the level is displayed, never a gate');

-- =============================================================================
-- 6. venues.amenities is a closed catalog, written by REPLACEMENT
--
-- Unticking is the operation that matters. A setter that merges can only ever
-- add amenities, so a venue that loses its showers keeps advertising them —
-- and the failure is invisible, because every amenity shown is one that was
-- true once.
-- =============================================================================

select pg_temp.ok(
  pg_temp.chk('venues', 'venues_amenities_catalog') like '%<@%',
  'venues.amenities is containment-constrained to a closed catalog',
  pg_temp.chk('venues', 'venues_amenities_catalog'));

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.venues (name, amenities)
    values ('conformance-a venue bad', array['helicopter_pad'])
  $q$) = 'check_violation',
  'an amenity outside the catalog is refused');

select pg_temp.ok(
  pg_temp.chk('venues', 'venues_amenities_distinct') <> 'ABSENT',
  'venues.amenities rejects duplicates');

-- Replacement, not merge: the setter assigns the array it is given.
select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'set_venue_amenities' and prosrc ~* 'amenities\s*=') = 1,
  'set_venue_amenities ASSIGNS amenities (replace), rather than appending');

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'set_venue_amenities' and prosrc ~* '(\|\||array_cat|array_append)') = 0,
  'set_venue_amenities never concatenates — unticking has to be able to remove');

-- =============================================================================
-- 7. The venue image reference CHECK was WIDENED, not replaced
--
-- Two shapes must both be accepted: a committed repo asset (`/venues/pitch.png`)
-- and a `venue-photos` bucket key (`venues/<uuid>.png`). Replacing the first
-- rule with the second would invalidate every venue whose photo ships with the
-- repository, and the symptom is a broken image rather than a failed write.
-- =============================================================================

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.venues (name, image_path)
    values ('conformance-a venue repo', '/venues/letna.png')
  $q$) = 'ok',
  'a committed repo asset path is accepted');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.venues (name, image_path)
    values ('conformance-a venue bucket',
            'venues/2f1efd48-0000-4000-8000-000000000001.png')
  $q$) = 'ok',
  'a venue-photos bucket key is accepted');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.venues (name, image_path)
    values ('conformance-a venue evil', 'https://example.com/x.png')
  $q$) = 'check_violation',
  'an absolute URL is refused — the column reaches an <img src>');

-- =============================================================================
-- 8. site_settings grants — explicit, and no more than explicit
--
-- Supabase auto-expose is off and auto-RLS is on, so a table that forgets its
-- GRANT returns EMPTY rather than erroring, which looks like missing data
-- instead of a missing grant. The read grants must therefore be asserted
-- positively.
--
-- The write side is asserted negatively, and that is where this suite finds
-- something. See the TRUNCATE probe.
-- =============================================================================

select pg_temp.ok(
  has_table_privilege('anon', 'public.site_settings', 'SELECT'),
  'site_settings grants SELECT to anon explicitly');

select pg_temp.ok(
  has_table_privilege('authenticated', 'public.site_settings', 'SELECT'),
  'site_settings grants SELECT to authenticated explicitly');

select pg_temp.ok(
  not has_table_privilege('anon', 'public.site_settings', 'INSERT')
  and not has_table_privilege('anon', 'public.site_settings', 'UPDATE')
  and not has_table_privilege('anon', 'public.site_settings', 'DELETE'),
  'anon cannot INSERT, UPDATE or DELETE site_settings — writes go via the RPC');

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.site_settings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.site_settings', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.site_settings', 'DELETE'),
  'authenticated cannot INSERT, UPDATE or DELETE site_settings');

/*
 * TRUNCATE, asserted separately and deliberately.
 *
 * RLS does not restrict TRUNCATE. A policy-protected table whose role holds
 * TRUNCATE is a table that role can empty in one statement, and no policy is
 * consulted on the way. It is also the privilege most likely to be granted by
 * accident, because `aclitem` spells DELETE as lowercase `d` and TRUNCATE as
 * uppercase `D` — an ACL reading `anon=rDxtm` looks like it contains a delete
 * grant and does not; it contains a truncate grant, which is worse.
 *
 * That is not hypothetical here: CLAUDE.md records the same two characters
 * costing a debugging session on the seed reset.
 */
select pg_temp.ok(
  not has_table_privilege('anon', 'public.site_settings', 'TRUNCATE'),
  'anon cannot TRUNCATE site_settings',
  'ACL: ' || (select coalesce(array_to_string(relacl, ' '), 'default')
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'site_settings'));

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.site_settings', 'TRUNCATE'),
  'authenticated cannot TRUNCATE site_settings');

select pg_temp.ok(
  not has_table_privilege('anon', 'public.pass_tiers', 'TRUNCATE'),
  'anon cannot TRUNCATE pass_tiers',
  'ACL: ' || (select coalesce(array_to_string(relacl, ' '), 'default')
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'pass_tiers'));

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.pass_tiers', 'TRUNCATE'),
  'authenticated cannot TRUNCATE pass_tiers');

-- The shape of the correct answer, for contrast: games and venues are also
-- anon-readable and hold no TRUNCATE. The pattern exists in this database
-- already; two tables diverge from it.
select pg_temp.ok(
  has_table_privilege('anon', 'public.games', 'SELECT')
  and not has_table_privilege('anon', 'public.games', 'TRUNCATE'),
  'control: games is anon-readable and anon-truncatable is false');

select pg_temp.ok(
  has_table_privilege('anon', 'public.venues', 'SELECT')
  and not has_table_privilege('anon', 'public.venues', 'TRUNCATE'),
  'control: venues is anon-readable and anon-truncatable is false');

-- =============================================================================
-- 9. The games-per-week figure is a CLAIM, not a measurement
--
-- Stored in site_settings and edited by an admin. It is marketing copy with a
-- number in it; computing it from `games` would make the home page's headline
-- move on its own whenever a week was quiet.
-- =============================================================================

select pg_temp.ok(
  (select settings ? 'games_per_week' from public.site_settings limit 1),
  'site_settings carries an admin-claimed games_per_week');

select pg_temp.ok(
  (select count(*) from public.site_settings) = 1,
  'site_settings is a singleton');

-- =============================================================================
-- 10. A missing grant FAILS LOUDLY here, rather than reading as empty
--
-- The point of the whole suite. Revoke the grant inside this transaction, read
-- as anon, and confirm the read is DENIED rather than returning zero rows —
-- because zero rows is exactly what a working policy over an ungranted table
-- looks like from the application's side, and the two are one careless GRANT
-- apart.
--
-- `count(_p::text)`, never `count(*)`: count(*) reads no column, so the planner
-- may prune the probe out of the plan entirely and report success for a call
-- that never ran.
-- =============================================================================

revoke select on public.site_settings from anon;

set local role anon;
select pg_temp.ok(
  pg_temp.attempt(
    $q$select count(_p::text) from (select settings from public.site_settings) _p$q$
  ) = 'denied',
  'with its grant revoked, the read is DENIED — not silently empty');
reset role;

-- Put it back inside the transaction; the rollback would anyway, but leaving a
-- revoke standing between here and the rollback would make every later probe
-- in this file depend on statement order.
grant select on public.site_settings to anon;

set local role anon;
select pg_temp.ok(
  pg_temp.attempt(
    $q$select count(_p::text) from (select settings from public.site_settings) _p$q$
  ) = 'ok',
  'with the grant restored, anon reads site_settings again');
reset role;

-- =============================================================================
-- 11. The event catalog is a strict superset of what this round can emit
--
-- `events.event_type` is constrained by a single CHECK. Any migration emitting
-- a NEW event type has to widen it in the SAME migration, and forgetting fails
-- at the first WRITE rather than at the migration — naming a constraint that
-- has nothing to do with the feature. It has been missed once already:
-- migration 24 added the photo events and omitted the top-up ones, so the first
-- create_topup failed on the catalog.
-- =============================================================================

select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''topup_requested''%',
  'catalog covers topup_requested');
select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''topup_confirmed''%',
  'catalog covers topup_confirmed');
select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''profile_photo_removed''%',
  'catalog covers profile_photo_removed');
select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''player_anonymized''%',
  'catalog covers player_anonymized');
select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''credit_expired''%',
  'catalog covers credit_expired');
select pg_temp.ok(
  pg_temp.chk('events', 'events_event_type_catalog') like '%''site_setting_changed''%',
  'catalog covers site_setting_changed');

-- An uncatalogued type does not merely fail its own insert — it raises, and the
-- enclosing transaction is the thing that rolls back.
select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.events (event_type, policy_version)
    values ('definitely_not_catalogued', 'v1')
  $q$) = 'check_violation',
  'an uncatalogued event_type raises rather than being written');

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
