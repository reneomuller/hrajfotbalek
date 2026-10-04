-- =============================================================================
-- ROUND 39, ITEM 2 — a venue is archived, not deleted. Drilled.
--
-- Run:  node supabase/tests/run.mjs venue_archive
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

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000039d1', 'va-admin@test.invalid'),
  ('60000000-0000-0000-0000-0000000039d2', 'va-player@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6eee0000-0000-0000-0000-0000000039d1', 'VaAdmin', 'va-admin@test.invalid',
   '60000000-0000-0000-0000-0000000039d1', true),
  ('6eee0000-0000-0000-0000-0000000039d2', 'VaPlayer', 'va-player@test.invalid',
   '60000000-0000-0000-0000-0000000039d2', false);

insert into public.venues (id, name) values
  ('7eee0000-0000-0000-0000-0000000039e1', 'Archive Me Ground'),
  ('7eee0000-0000-0000-0000-0000000039e2', 'Empty Ground');

insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes) values
  ('9eee0000-0000-0000-0000-0000000039f1', 'Archive Me Ground', '7eee0000-0000-0000-0000-0000000039e1',
   now() - interval '10 days', 12, 180, 'settled', 90);

create function pg_temp.archived(p uuid) returns boolean language sql security definer as $$
  select archived_at is not null from public.venues where id = p
$$;

-- =============================================================================
-- ONLY AN ADMIN ARCHIVES
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039d2');
select pg_temp.ok_probe(
  $q$select public.admin_archive_venue('7eee0000-0000-0000-0000-0000000039e1')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot archive a venue');
select pg_temp.ok_probe(
  $q$select public.admin_restore_venue('7eee0000-0000-0000-0000-0000000039e1')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot restore a venue');
reset role;

-- =============================================================================
-- ARCHIVE A VENUE THAT HAS GAMES — which delete never could
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039d1');
select pg_temp.ok_probe(
  $q$select public.admin_delete_venue('7eee0000-0000-0000-0000-0000000039e1')$q$,
  'raise:VENUE_HAS_GAMES',
  'a venue with games still cannot be hard-deleted');
select pg_temp.ok_probe(
  $q$select public.admin_archive_venue('7eee0000-0000-0000-0000-0000000039e1')$q$,
  'rows:1',
  'but it CAN be archived');
select pg_temp.ok_probe(
  $q$select public.admin_archive_venue('7eee0000-0000-0000-0000-0000000039e1')$q$,
  'rows:1',
  'archiving twice is a no-op, not an error');
reset role;

select pg_temp.ok(pg_temp.archived('7eee0000-0000-0000-0000-0000000039e1'), 'the venue is archived');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'venue_archived'
      and metadata ->> 'venue_id' = '7eee0000-0000-0000-0000-0000000039e1') = 1,
  'ONE venue_archived event, not two');

-- THE GAME STILL READS ITS VENUE, as a player and as anonymous.
select pg_temp.act_as('60000000-0000-0000-0000-0000000039d2');
select pg_temp.ok(
  (select v.name from public.games g join public.venues v on v.id = g.venue_id
    where g.id = '9eee0000-0000-0000-0000-0000000039f1') = 'Archive Me Ground',
  'a player still reads the archived venue through its game');
reset role;

set local role anon;
select pg_temp.ok_probe(
  $q$select * from public.venues where id = '7eee0000-0000-0000-0000-0000000039e1'$q$,
  'rows:1',
  'anon can still select * on venues — the new column is granted');
reset role;

-- =============================================================================
-- RESTORE
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039d1');
select public.admin_restore_venue('7eee0000-0000-0000-0000-0000000039e1');
select public.admin_restore_venue('7eee0000-0000-0000-0000-0000000039e1');
reset role;

select pg_temp.ok(not pg_temp.archived('7eee0000-0000-0000-0000-0000000039e1'), 'restore clears the archive');
select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'venue_restored'
      and metadata ->> 'venue_id' = '7eee0000-0000-0000-0000-0000000039e1') = 1,
  'ONE venue_restored event for two restores');

-- =============================================================================
-- A VENUE WITH ZERO GAMES STILL HARD-DELETES
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039d1');
select pg_temp.ok_probe(
  $q$select public.admin_delete_venue('7eee0000-0000-0000-0000-0000000039e2')$q$,
  'rows:1',
  'a venue with zero games still hard-deletes');
select pg_temp.ok_probe(
  $q$select public.admin_archive_venue('7eee0000-0000-0000-0000-0000000039e2')$q$,
  'raise:VENUE_NOT_FOUND',
  'archiving a venue that is gone names it');
reset role;

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
