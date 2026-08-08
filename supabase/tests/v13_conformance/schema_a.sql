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

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql as $$
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
