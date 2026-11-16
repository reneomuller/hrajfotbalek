-- =============================================================================
-- INDOOR OR OUTDOOR (2026-11-16).
--
-- The owner: "we currently have no selection of indoor or outdoor, so let's
-- also please add that in the same area we choose the surface". A game is one
-- or the other, or not yet said; only an admin says; anyone may read it, like
-- the surface beside it on the card.
--
-- Run:  node supabase/tests/run.mjs game_indoor
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
  ('42470000-0000-0000-0000-000000000001', 'r42i-admin@test.invalid'),
  ('42470000-0000-0000-0000-000000000002', 'r42i-player@test.invalid');
insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('4e470000-0000-0000-0000-000000000001', 'R42IAdmin', 'r42i-admin@test.invalid', '42470000-0000-0000-0000-000000000001', true),
  ('4e470000-0000-0000-0000-000000000002', 'R42IPlayer', 'r42i-player@test.invalid', '42470000-0000-0000-0000-000000000002', false);
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94247000-0000-0000-0000-0000000000a1', 'R42I Hall', now() + interval '3 days', 14, 180, 'published', 90);

-- =============================================================================
-- WHO MAY SAY
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.set_game_indoor('94247000-0000-0000-0000-0000000000a1'::uuid, true)$q$,
  'denied', 'a signed-out visitor cannot set it');
reset role;

select pg_temp.act_as('42470000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.set_game_indoor('94247000-0000-0000-0000-0000000000a1'::uuid, true)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot set it');
reset role;

select pg_temp.act_as('42470000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_indoor('00000000-0000-0000-0000-000000000000'::uuid, true)$q$,
  'raise:GAME_NOT_FOUND', 'nor can an admin, on a game that does not exist');
select pg_temp.ok_probe(
  $q$select public.set_game_indoor('94247000-0000-0000-0000-0000000000a1'::uuid, true)$q$,
  'rows:1', 'an admin says the game is indoor');
reset role;
select pg_temp.ok(
  (select indoor from public.games where id = '94247000-0000-0000-0000-0000000000a1') is true,
  'stored as indoor');

select pg_temp.act_as('42470000-0000-0000-0000-000000000001');
select public.set_game_indoor('94247000-0000-0000-0000-0000000000a1', false);
reset role;
select pg_temp.ok(
  (select indoor from public.games where id = '94247000-0000-0000-0000-0000000000a1') is false,
  'and then outdoor');

-- =============================================================================
-- WHO MAY READ
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select indoor from public.games where id = '94247000-0000-0000-0000-0000000000a1' and indoor = false$q$,
  'rows:1', 'a signed-out visitor reads it, like the surface');
reset role;

-- =============================================================================
-- CLEARING IT
-- =============================================================================

select pg_temp.act_as('42470000-0000-0000-0000-000000000001');
select public.set_game_indoor('94247000-0000-0000-0000-0000000000a1', null);
reset role;
select pg_temp.ok(
  (select indoor is null from public.games where id = '94247000-0000-0000-0000-0000000000a1'),
  'null says nothing either way');

select pg_temp.ok(
  (public.app_capabilities() ->> 'gameIndoor')::boolean,
  'app_capabilities reports gameIndoor');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
