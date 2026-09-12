-- =============================================================================
-- ROUND 31, ITEM 1 — the venue keeps source AND coordinates, drilled.
--
-- Run:  node supabase/tests/run.mjs venue_map_url
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
  ('a0000000-0000-0000-0000-00000000ae01', 'vm1@test.invalid'),
  ('a0000000-0000-0000-0000-00000000ae02', 'vm2@test.invalid');
insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000ae01', 'VenueAdmin', 'vm1@test.invalid',
   'a0000000-0000-0000-0000-00000000ae01', true),
  ('aaaa0000-0000-0000-0000-00000000ae02', 'VenuePlayer', 'vm2@test.invalid',
   'a0000000-0000-0000-0000-00000000ae02', false);

create function pg_temp.venue(p_name text)
returns public.venues language sql security definer as $$
  select v.* from public.venues v where v.name = p_name;
$$;

-- =============================================================================
-- the column, and the constraint that keeps it honest
-- =============================================================================

select pg_temp.ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='venues' and column_name='map_url'),
  'venues.map_url exists');

/*
 * A URL IN `map_query` IS REFUSED AT THE TABLE. Two production rows held one
 * before round 31 and the address line printed them to players as streets.
 * Asserted as a REFUSAL rather than as a convention, because a convention is
 * what allowed it the first time.
 */
select pg_temp.ok_probe(
  $q$insert into public.venues (name, map_query)
     values ('Drill URL Venue', 'https://maps.app.goo.gl/abc') returning id$q$,
  'error:23514',
  'a URL in map_query is refused by the constraint');

-- =============================================================================
-- the writers persist BOTH halves
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ae01');
select public.admin_create_venue(
  'Drill Share Venue', null, '50.0871,14.4695', 'https://maps.app.goo.gl/AbCdEf123');
reset role;

select pg_temp.ok(
  (pg_temp.venue('Drill Share Venue')).map_url = 'https://maps.app.goo.gl/AbCdEf123',
  'create keeps the share link verbatim',
  coalesce((pg_temp.venue('Drill Share Venue')).map_url, '<null>'));

select pg_temp.ok(
  (pg_temp.venue('Drill Share Venue')).map_query = '50.0871,14.4695',
  'and keeps the coordinates beside it — the provenance round 30 threw away');

-- THE TRAILING DEFAULT MEANS EVERY OLDER CALLER STILL WORKS.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000ae01');
select public.admin_create_venue('Drill Plain Venue', null, 'Nad Ohradou 2825/23');
reset role;

select pg_temp.ok(
  (pg_temp.venue('Drill Plain Venue')).map_url is null
    and (pg_temp.venue('Drill Plain Venue')).map_query = 'Nad Ohradou 2825/23',
  'a three-argument create still works and stores no url');

-- =============================================================================
-- update carries both, and clearing a field clears the column
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ae01');
select public.admin_update_venue(
  (pg_temp.venue('Drill Share Venue')).id, 'Drill Share Venue',
  '50.1,14.5', null, 'https://maps.app.goo.gl/Changed');
reset role;

select pg_temp.ok(
  (pg_temp.venue('Drill Share Venue')).map_url = 'https://maps.app.goo.gl/Changed'
    and (pg_temp.venue('Drill Share Venue')).map_query = '50.1,14.5',
  'update carries both halves');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ae01');
select public.admin_update_venue(
  (pg_temp.venue('Drill Share Venue')).id, 'Drill Share Venue', '', null, '');
reset role;

select pg_temp.ok(
  (pg_temp.venue('Drill Share Venue')).map_url is null
    and (pg_temp.venue('Drill Share Venue')).map_query is null,
  'clearing a field stores NULL rather than an empty string every reader must special-case');

-- =============================================================================
-- authorization is unchanged by the new argument
-- =============================================================================

/*
 * ACTED AS A REAL NON-ADMIN, not run bare. With no `act_as` the suite's own
 * connection is the owner role, which satisfies `is_service_role()` — so the
 * first version of this assertion "passed" the refusal by being allowed, which
 * is a false negative on an authorization test.
 */
select pg_temp.act_as('a0000000-0000-0000-0000-00000000ae02');
select pg_temp.ok_probe(
  $q$select public.admin_create_venue('Drill Denied Venue', null, null, 'https://maps.app.goo.gl/x')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin still cannot create a venue, new argument or not');
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
