-- =============================================================================
-- ROUND 42 — a venue's address, for the game's story image.
--
-- The owner wants the 9:16 story to carry the address "in format 'Dubecska 9,
-- Praha 7'". Venues held nothing like it — `map_query` is empty or a pair of
-- coordinates — so an admin types it once per venue.
--
--   * only an admin sets it; it is trimmed, an empty one clears it, and a
--     novel is refused
--   * anyone may read it, like the venue's name
--
-- Run:  node supabase/tests/run.mjs venue_address
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

create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end $$;

create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  -- `count(_p::text)`, never `count(*)` — see cancel_guests.sql.
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
  ('42440000-0000-0000-0000-000000000001', 'r42v-1@test.invalid'),
  ('42440000-0000-0000-0000-000000000002', 'r42v-2@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('4e440000-0000-0000-0000-000000000001', 'R42VAdmin',  'r42v-1@test.invalid', '42440000-0000-0000-0000-000000000001', true),
  ('4e440000-0000-0000-0000-000000000002', 'R42VPlayer', 'r42v-2@test.invalid', '42440000-0000-0000-0000-000000000002', false);

insert into public.venues (id, name) values
  ('94244000-0000-0000-0000-0000000000c1', 'R42V Pitch');

-- =============================================================================
-- WHO MAY SET IT
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.set_venue_address('94244000-0000-0000-0000-0000000000c1'::uuid, 'Dubečská 9, Praha 10')$q$,
  'denied', 'a signed-out visitor cannot call it');
reset role;

select pg_temp.act_as('42440000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.set_venue_address('94244000-0000-0000-0000-0000000000c1'::uuid, 'Dubečská 9, Praha 10')$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot set a venue''s address');
reset role;

select pg_temp.act_as('42440000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_venue_address('00000000-0000-0000-0000-000000000000'::uuid, 'Dubečská 9, Praha 10')$q$,
  'raise:VENUE_NOT_FOUND', 'nor can an admin set one on a venue that does not exist');
select pg_temp.ok_probe(
  $q$select public.set_venue_address('94244000-0000-0000-0000-0000000000c1'::uuid, '  Dubečská 9, Praha 10  ')$q$,
  'rows:1', 'an admin sets the address');
reset role;

select pg_temp.ok(
  (select address from public.venues where id = '94244000-0000-0000-0000-0000000000c1') = 'Dubečská 9, Praha 10',
  'stored trimmed', (select address from public.venues where id = '94244000-0000-0000-0000-0000000000c1'));

select pg_temp.act_as('42440000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_venue_address('94244000-0000-0000-0000-0000000000c1'::uuid, repeat('x', 121))$q$,
  'raise:ADDRESS_TOO_LONG', 'a paragraph is not an address');
reset role;

-- =============================================================================
-- WHO MAY READ IT
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select address from public.venues where id = '94244000-0000-0000-0000-0000000000c1' and address = 'Dubečská 9, Praha 10'$q$,
  'rows:1', 'a signed-out visitor reads it, like the name');
reset role;

-- =============================================================================
-- CLEARING IT
-- =============================================================================

select pg_temp.act_as('42440000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_venue_address('94244000-0000-0000-0000-0000000000c1'::uuid, '   ')$q$,
  'rows:1', 'an admin clears it with an empty box');
reset role;
select pg_temp.ok(
  (select address is null from public.venues where id = '94244000-0000-0000-0000-0000000000c1'),
  'and the venue has no address, not an empty one');

select pg_temp.ok(
  (public.app_capabilities() ->> 'venueAddress')::boolean,
  'app_capabilities reports venueAddress');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
