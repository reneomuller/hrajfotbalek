-- =============================================================================
-- ROUND 33, ITEM 1 — the admin rename, drilled.
--
-- Run:  node supabase/tests/run.mjs admin_rename_player
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

-- WHY THIS IS A SQL SUITE AND NOT A VERIFICATION BLOCK IN THE MIGRATION. Every
-- assertion below WRITES — it renames people, it emits events, it takes a
-- nickname to prove the next caller cannot. A migration that did this against
-- production would leave every one of those rows behind, which is not
-- hypothetical: one did, on 2026-09-09. `run.mjs` wraps this file in
-- `begin; … rollback;` and nothing survives it.

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000e0a1', 'rn1@test.invalid'),
  ('a0000000-0000-0000-0000-00000000e0a2', 'rn2@test.invalid'),
  ('a0000000-0000-0000-0000-00000000e0a3', 'rn3@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000e0a1', 'RenameAdmin', 'rn1@test.invalid',
   'a0000000-0000-0000-0000-00000000e0a1', true),
  ('aaaa0000-0000-0000-0000-00000000e0a2', 'BeforeName', 'rn2@test.invalid',
   'a0000000-0000-0000-0000-00000000e0a2', false),
  ('aaaa0000-0000-0000-0000-00000000e0a3', 'Bystander', 'rn3@test.invalid',
   'a0000000-0000-0000-0000-00000000e0a3', false);

-- Reads the row OUT of the role under test. `players_select_own` is an own-row
-- policy, so a bare subselect under `act_as(admin)` returns NULL for somebody
-- else's row and every assertion below would pass against nothing.
create function pg_temp.name_of(p uuid) returns text language sql security definer as $$
  select nickname from public.players where id = p
$$;

-- =============================================================================
-- the happy path — an admin renames somebody else
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000e0a1');
select pg_temp.ok(
  public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a2', 'AfterName') = 'AfterName',
  'the rename returns the stored name');
reset role;

select pg_temp.ok(
  pg_temp.name_of('aaaa0000-0000-0000-0000-00000000e0a2') = 'AfterName',
  'and the row carries it',
  coalesce(pg_temp.name_of('aaaa0000-0000-0000-0000-00000000e0a2'), '<null>'));

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'player_renamed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000e0a2'
      and metadata ->> 'from' = 'BeforeName'
      and metadata ->> 'to' = 'AfterName'
      and metadata ->> 'by_player_id' = 'aaaa0000-0000-0000-0000-00000000e0a1') = 1,
  'the event names the actor and BOTH names — an audit line that omits the old '
  'one cannot answer "who was this?"');

-- =============================================================================
-- authorization lives INSIDE the function, where curl meets it
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000e0a2');
select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', 'Hijacked')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot rename another player');
reset role;

-- THE ONE THAT WOULD BE MISSED BY A ROUTE GUARD. A non-admin renaming THEMSELF
-- through this RPC is still refused: self-service renaming is the profile
-- form's own column-scoped grant, and this function is moderation.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000e0a2');
select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a2', 'SelfServe')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'nor themselves — this path is moderation, not the profile form');
reset role;

select pg_temp.ok(
  pg_temp.name_of('aaaa0000-0000-0000-0000-00000000e0a3') = 'Bystander',
  'and the bystander was not touched');

-- =============================================================================
-- the rules the CHECK and the unique index enforce, restated as messages
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000e0a1');

select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', '')$q$,
  'raise:NICKNAME_INVALID', 'an empty name is refused');

select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', '   ')$q$,
  'raise:NICKNAME_INVALID', 'and so is whitespace, which trims to empty');

select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', 'Jan Čerňák')$q$,
  'raise:NICKNAME_INVALID',
  'and a character the format CHECK forbids — refused HERE, so the message '
  'names the field rather than the constraint');

select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', 'ThisNameIsFarTooLongToStore')$q$,
  'raise:NICKNAME_INVALID', 'and one over twenty characters');

-- lower(nickname) is unique, so case is not an escape from it.
select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a3', 'aftername')$q$,
  'raise:NICKNAME_TAKEN',
  'a name another player holds is refused in ANY case — the index is on lower()');

select pg_temp.ok(
  public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a2', 'AFTERNAME') = 'AFTERNAME',
  'but a player may re-case their OWN name');

select pg_temp.ok_probe(
  $q$select public.admin_set_display_name('00000000-0000-0000-0000-000000000000', 'Nobody')$q$,
  'raise:PLAYER_NOT_FOUND', 'an unknown player raises');

reset role;

-- =============================================================================
-- a rename to the same name is a no-op, not a log entry
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000e0a1');
select pg_temp.ok(
  public.admin_set_display_name('aaaa0000-0000-0000-0000-00000000e0a2', 'AFTERNAME') = 'AFTERNAME',
  'renaming to the current name succeeds');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'player_renamed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000e0a2') = 2,
  'and writes no third event — two renames happened, the no-op did not',
  (select count(*)::text from public.events
    where event_type = 'player_renamed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000e0a2'));

-- =============================================================================
-- the catalog admits the new type, which is the thing that fails at the first
-- WRITE rather than at the migration
-- =============================================================================

select pg_temp.ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'events_event_type_catalog') like '%player_renamed%',
  'events_event_type_catalog admits player_renamed');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
