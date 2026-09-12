-- =============================================================================
-- ROUND 30, ITEM 2 — admin banner removal, drilled.
--
-- Run:  node supabase/tests/run.mjs admin_remove_cover
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
  ('a0000000-0000-0000-0000-00000000c0a1', 'cv1@test.invalid'),
  ('a0000000-0000-0000-0000-00000000c0a2', 'cv2@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin, cover_path, photo_path) values
  ('aaaa0000-0000-0000-0000-00000000c0a1', 'CoverAdmin', 'cv1@test.invalid',
   'a0000000-0000-0000-0000-00000000c0a1', true, 'covers/aaaa0000-0000-0000-0000-00000000c0a1.jpg', 'players/aaaa0000-0000-0000-0000-00000000c0a1.jpg'),
  ('aaaa0000-0000-0000-0000-00000000c0a2', 'CoverPlayer', 'cv2@test.invalid',
   'a0000000-0000-0000-0000-00000000c0a2', false, 'covers/aaaa0000-0000-0000-0000-00000000c0a2.jpg', 'players/aaaa0000-0000-0000-0000-00000000c0a2.jpg');

create function pg_temp.cover_of(p uuid) returns text language sql security definer as $$
  select cover_path from public.players where id = p;
$$;
create function pg_temp.photo_of(p uuid) returns text language sql security definer as $$
  select photo_path from public.players where id = p;
$$;

-- =============================================================================
-- authorization — admin only, and it may not be reached by the subject
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000c0a2');
select pg_temp.ok_probe(
  $q$select public.remove_profile_cover('aaaa0000-0000-0000-0000-00000000c0a2')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot call the admin cover removal, even on themselves');
reset role;

-- =============================================================================
-- it removes the BANNER and leaves the avatar alone
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000c0a1');
create temp table _removed as
  select public.remove_profile_cover('aaaa0000-0000-0000-0000-00000000c0a2') as path;
reset role;

select pg_temp.ok(
  (select path from _removed) = 'covers/aaaa0000-0000-0000-0000-00000000c0a2.jpg',
  'it returns the storage path the caller must delete',
  coalesce((select path from _removed), '<null>'));

select pg_temp.ok(
  pg_temp.cover_of('aaaa0000-0000-0000-0000-00000000c0a2') is null,
  'the banner is cleared');

select pg_temp.ok(
  pg_temp.photo_of('aaaa0000-0000-0000-0000-00000000c0a2') = 'players/aaaa0000-0000-0000-0000-00000000c0a2.jpg',
  'THE AVATAR IS UNTOUCHED — two controls, two targets');

-- THE ADMIN'S OWN BANNER IS UNTOUCHED. `clear_cover_photo()` takes no argument
-- and clears the CALLER's; this one names its subject, which is the whole
-- reason it exists as a separate function.
select pg_temp.ok(
  pg_temp.cover_of('aaaa0000-0000-0000-0000-00000000c0a1') = 'covers/aaaa0000-0000-0000-0000-00000000c0a1.jpg',
  'the admin did not wipe their own banner');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'profile_photo_removed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000c0a2'
      and metadata ->> 'kind' = 'cover') = 1,
  'the removal is logged as a cover removal, without widening the event catalog');

-- =============================================================================
-- idempotence — moderating an already-removed banner is a no-op, not an error
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000c0a1');
select pg_temp.ok(
  public.remove_profile_cover('aaaa0000-0000-0000-0000-00000000c0a2') is null,
  'a second removal returns null rather than raising');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'profile_photo_removed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000c0a2') = 1,
  'and writes no second event — a log that records non-events cannot be counted');

-- =============================================================================
-- a player who does not exist is an error, not a silent null
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000c0a1');
select pg_temp.ok_probe(
  $q$select public.remove_profile_cover('00000000-0000-0000-0000-000000000000')$q$,
  'raise:PLAYER_NOT_FOUND',
  'an unknown player raises rather than returning null');
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
