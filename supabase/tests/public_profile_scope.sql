-- =============================================================================
-- ROUND 28, ITEM 4 — the public profile's widened scope, drilled.
--
-- Run:  node supabase/tests/run.mjs public_profile_scope
--
-- MOVED OUT OF THE MIGRATION (2026-09-12). Its drill UPDATEd a real player's
-- country, skill level and positions and then set them to NULL — which, on a
-- committing apply, would have wiped a live profile. The migration now asserts
-- the composite's SHAPE; the behaviour lives here, inside run.mjs's rollback.
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
  ('a0000000-0000-0000-0000-0000000b7e01', 'pp1@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, country, skill_level, positions) values
  ('aaaa0000-0000-0000-0000-0000000b7e01', 'ScopePlayer', 'pp1@test.invalid',
   'a0000000-0000-0000-0000-0000000b7e01', 'CZ', 'intermediate', array['gk','mid']);

-- A guest: no auth user, and therefore no public profile at all.
insert into public.players (id, nickname) values
  ('aaaa0000-0000-0000-0000-0000000b7e02', 'ScopeGuest');

-- =============================================================================
-- the three new fields project
-- =============================================================================

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer')).country = 'CZ',
  'country projects');

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer')).skill_level = 'intermediate',
  'skill level projects, cast to text rather than exported as the enum');

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer')).positions = array['gk','mid'],
  'positions project, in order');

-- =============================================================================
-- UNSET STAYS UNSET — the page omits what is null, so it must not be coerced
-- =============================================================================

update public.players
   set country = null, skill_level = null, positions = '{}'
 where id = 'aaaa0000-0000-0000-0000-0000000b7e01';

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer')).country is null,
  'an unset country comes back NULL, not an empty string');

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer')).skill_level is null,
  'an unset skill level comes back NULL');

select pg_temp.ok(
  array_length((public.public_player_profile('ScopePlayer')).positions, 1) is null,
  'unset positions come back empty rather than null-filled');

-- =============================================================================
-- ROUND 14'S BOUNDARY STILL HOLDS — this is the half the amendment must not move
-- =============================================================================

select pg_temp.ok(
  (select array_agg(attname::text order by attname)
     from pg_attribute
    where attrelid = 'public.public_profile'::regtype::text::regclass
      and attnum > 0 and not attisdropped)
  = array['country','cover_path','games_played','hours','nickname','photo_path',
          'players_met','positions','skill_level','venues'],
  'the composite is exactly the ten allowed columns and no eleventh');

select pg_temp.ok(
  (public.public_player_profile('ScopePlayer'))::text not like '%@%',
  'nothing that looks like an email address crosses the boundary');

-- =============================================================================
-- a guest, a shadow and a stranger are all NULL, identically
-- =============================================================================

select pg_temp.ok(
  public.public_player_profile('ScopeGuest') is null,
  'a guest has no public profile');

select pg_temp.ok(
  public.public_player_profile('nobody at all') is null,
  'a stranger is null, and is not distinguishable from a guest');

select pg_temp.ok(
  public.public_player_profile('   ') is null,
  'blank input is null rather than an error');

-- CASE-INSENSITIVE, because the nickname arrives from a URL.
select pg_temp.ok(
  (public.public_player_profile('scopeplayer')).nickname = 'ScopePlayer',
  'the lookup is case-insensitive and returns the stored casing');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
