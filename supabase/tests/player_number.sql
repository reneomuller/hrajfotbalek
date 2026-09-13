-- =============================================================================
-- ROUND 33, ITEM 2 — the permanent player number, drilled.
--
-- Run:  node supabase/tests/run.mjs player_number
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

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
end $$;

create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  -- `count(_p::text)`, never `count(*)`: the planner prunes a non-volatile
  -- function call out of a `count(*)` plan and the privilege check never runs,
  -- which is a FALSE PASS on exactly the assertions these suites exist to make.
  execute 'with _p as (' || sql || ') select count(_p::text) from _p' into n;
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

-- --- fixtures ----------------------------------------------------------------

-- EVERY ASSERTION HERE WRITES — it creates players, deletes one, and proves the
-- deleted number does not come back. None of that belongs in a migration's
-- verification block; `run.mjs` rolls the whole file back.

-- =============================================================================
-- the backfill — every existing row has a number, and the numbers are unique
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.players where player_number is null) = 0,
  'every player carries a number',
  (select count(*)::text from public.players where player_number is null));

select pg_temp.ok(
  (select count(distinct player_number) from public.players)
    = (select count(*) from public.players),
  'and no two players share one');

-- SIGNUP ORDER, ASSERTED AGAINST THE CLOCK rather than against the backfill's
-- own arithmetic. Ties are permitted: the seed writes several rows in one
-- transaction where `now()` is identical for all of them, which is exactly why
-- the backfill orders by `(created_at, id)` and not by `created_at` alone.
select pg_temp.ok(
  not exists (
    select 1
      from public.players a
      join public.players b on b.player_number > a.player_number
     where b.created_at < a.created_at
  ),
  'a lower number never belongs to a later signup');

-- =============================================================================
-- a new player takes the next number, without anybody asking for one
-- =============================================================================

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000e1a1', 'pn1@test.invalid'),
  ('a0000000-0000-0000-0000-00000000e1a2', 'pn2@test.invalid'),
  ('a0000000-0000-0000-0000-00000000e1a3', 'pn3@test.invalid');

-- NOTE WHAT IS NOT IN THIS INSERT: `player_number`. The column default is the
-- assignment, which is the whole reason it is a default and not a line in each
-- signup RPC — this insert is a path nobody wrote the feature for.
insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000e1a1', 'NumFirst', 'pn1@test.invalid',
   'a0000000-0000-0000-0000-00000000e1a1');

create function pg_temp.number_of(p uuid) returns integer language sql security definer as $$
  select player_number from public.players where id = p
$$;

select pg_temp.ok(
  pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a1') is not null,
  'a new player is numbered without being given one',
  coalesce(pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a1')::text, '<null>'));

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000e1a2', 'NumSecond', 'pn2@test.invalid',
   'a0000000-0000-0000-0000-00000000e1a2');

select pg_temp.ok(
  pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a2')
    = pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a1') + 1,
  'and the one after it takes the next');

-- =============================================================================
-- NEVER REUSED — the assertion the whole design exists for
--
-- This is what separates a sequence from `max(n) + 1`, and it is the difference
-- between a number an analysis can trust across two exports and one that
-- silently points at a different person after somebody leaves.
-- =============================================================================

create temp table _gone as
select pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a2') as n;

delete from public.players where id = 'aaaa0000-0000-0000-0000-00000000e1a2';

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000e1a3', 'NumThird', 'pn3@test.invalid',
   'a0000000-0000-0000-0000-00000000e1a3');

select pg_temp.ok(
  pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a3') > (select n from _gone),
  'the number of a deleted player is NOT handed to the next signup',
  format('deleted %s, next got %s', (select n from _gone),
         pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a3')));

-- =============================================================================
-- PERMANENT — nothing renumbers, and a player cannot renumber themselves
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000e1a1');
select pg_temp.ok_probe(
  $q$update public.players set player_number = 1
      where auth_user_id = 'a0000000-0000-0000-0000-00000000e1a1' returning 1$q$,
  'denied',
  'a player cannot rewrite their own number — the column-scoped UPDATE grant '
  'was never widened to include it');
reset role;

select pg_temp.ok(
  pg_temp.number_of('aaaa0000-0000-0000-0000-00000000e1a1') > 1,
  'and the number stands');

-- =============================================================================
-- ADMIN-ONLY — it reaches no player-facing read
--
-- The two composites every roster and every public profile is built from are
-- named here BY COLUMN. A surface cannot print what its source does not carry,
-- and this is the assertion that survives somebody adding a new surface.
-- =============================================================================

select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
       and column_name = 'player_number'
  ),
  'the public roster does not carry the number');

select pg_temp.ok(
  not exists (
    select 1 from information_schema.routines r
     join information_schema.parameters p
       on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'public_player_profile'
      and p.parameter_name = 'player_number'
  ),
  'nor does the public profile composite');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
