-- =============================================================================
-- Phase 21 assertions — venues, game detail columns, admin games CRUD
--
-- Run:  node supabase/tests/run.mjs admin_games
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- `call()` is the value-consuming probe (POLISH.md): the shared `probe()`
-- helper wraps a call in `with _p as (…) select count(*) from _p`, and for a
-- non-volatile function the planner prunes the unread column, skipping the
-- privilege check and reporting a row where a direct call is denied. Every
-- function here is volatile, but the same helper is used throughout so the
-- suite cannot acquire that failure mode by someone later marking one STABLE.
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

-- Runs the statement and CONSUMES its result, so the privilege check and any
-- raise inside the function actually happen.
create function pg_temp.call(sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'select (' || sql || ')::text' into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000ad001', 'admin-g@test.invalid'),
  ('b0000000-0000-0000-0000-0000000b1001', 'player-g@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-0000000ad001', 'GameAdmin',  'admin-g@test.invalid',  'a0000000-0000-0000-0000-0000000ad001', true),
  ('bbbb0000-0000-0000-0000-0000000b1001', 'GamePlayer', 'player-g@test.invalid', 'b0000000-0000-0000-0000-0000000b1001', false);

insert into public.venues (id, name, image_path) values
  ('11110000-0000-0000-0000-000000000e01', 'Test Pitch', '/venues/test-pitch.jpg');

-- =============================================================================
-- venue constraints — the image path is the one that matters
-- =============================================================================

select pg_temp.ok(
  (select image_path from public.venues where id = '11110000-0000-0000-0000-000000000e01')
    = '/venues/test-pitch.jpg',
  'a well-formed venue image path is stored as given');

do $$
begin
  begin
    insert into public.venues (name, image_path) values ('Evil', 'javascript:alert(1)');
    perform pg_temp.ok(false, 'a javascript: image path is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'a javascript: image path is rejected by CHECK');
  end;

  begin
    insert into public.venues (name, image_path) values ('Offsite', 'https://evil.example/x.png');
    perform pg_temp.ok(false, 'an off-site image URL is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'an off-site image URL is rejected by CHECK');
  end;

  begin
    insert into public.venues (name, image_path) values ('Traversal', '/venues/../../etc/passwd');
    perform pg_temp.ok(false, 'a path-traversal image path is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'a path-traversal image path is rejected by CHECK');
  end;
end $$;

-- =============================================================================
-- game detail columns
-- =============================================================================

do $$
declare v_id uuid;
begin
  insert into public.games (venue, starts_at, capacity, price_czk, format, surface, notes)
  values ('Test Pitch', now() + interval '3 days', 12, 200, '6v6', 'turf', 'Gate code 1234')
  returning id into v_id;

  perform pg_temp.ok(
    (select format = '6v6' and surface = 'turf' and notes = 'Gate code 1234'
       from public.games where id = v_id),
    'format, surface and notes round-trip on a game');

  begin
    update public.games set format = 'six-a-side' where id = v_id;
    perform pg_temp.ok(false, 'a free-text format is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'a free-text format is rejected by CHECK');
  end;

  begin
    update public.games set surface = 'lava' where id = v_id;
    perform pg_temp.ok(false, 'an unknown surface is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'an unknown surface is rejected by CHECK');
  end;
end $$;

-- =============================================================================
-- admin_create_game — draft only, admin only
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ad001');

do $$
declare v_id uuid;
begin
  v_id := public.admin_create_game(
    '11110000-0000-0000-0000-000000000e01', now() + interval '5 days', 14, 250,
    '7v7', 'grass', 'Bring both kits');

  -- Assert as the owner, not as the admin session. `games_select_public` hides
  -- drafts from `authenticated` — including an admin — and `events` has no
  -- client grant at all, so asserting from inside the session under test would
  -- read an empty row set and pass for the wrong reason.
  reset role;

  perform pg_temp.ok(
    (select status = 'draft' from public.games where id = v_id),
    'a game created by admin_create_game is a draft');

  perform pg_temp.ok(
    (select venue = 'Test Pitch' and venue_id = '11110000-0000-0000-0000-000000000e01'
       from public.games where id = v_id),
    'the venue name is snapshotted onto the game beside the venue_id');

  perform pg_temp.ok(
    (select format = '7v7' and surface = 'grass' and notes = 'Bring both kits'
       from public.games where id = v_id),
    'format, surface and notes are written by admin_create_game');

  perform pg_temp.ok(
    not exists (select 1 from public.events
                 where game_id = v_id and event_type = 'game_published'),
    'creating a game publishes nothing');

  -- Back into the admin session for the rejection cases that follow.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-0000-0000-0000000ad001',
                      'role', 'authenticated')::text, true);
end $$;

select pg_temp.ok_call(
  $q$select public.admin_create_game('99990000-0000-0000-0000-00000000dead', now() + interval '1 day', 10, 100)$q$,
  'raise:VENUE_NOT_FOUND',
  'creating a game against an unknown venue is rejected');

select pg_temp.ok_call(
  $q$select public.admin_create_game('11110000-0000-0000-0000-000000000e01', now() + interval '1 day', 0, 100)$q$,
  'raise:INVALID_CAPACITY',
  'a zero capacity is rejected');

select pg_temp.ok_call(
  $q$select public.admin_create_venue('Test Pitch')$q$,
  'raise:VENUE_EXISTS',
  'creating a venue that already exists is reported, not silently reused');

reset role;

-- =============================================================================
-- authorization — the surface gate is not the only gate
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-0000000b1001');

select pg_temp.ok_call(
  $q$select public.admin_create_game('11110000-0000-0000-0000-000000000e01', now() + interval '1 day', 10, 100)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin authenticated caller cannot create a game');

select pg_temp.ok_call(
  $q$select public.admin_create_venue('Player Pitch')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin authenticated caller cannot create a venue');

-- The direct write is refused too, so the RPC is not merely the polite route.
select pg_temp.ok_call(
  $q$select public.admin_update_game('00000000-0000-0000-0000-0000000000aa', '11110000-0000-0000-0000-000000000e01', now(), 100)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin authenticated caller cannot edit a game');

reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select pg_temp.ok_call(
  $q$select public.admin_create_game('11110000-0000-0000-0000-000000000e01', now() + interval '1 day', 10, 100)$q$,
  'denied',
  'an anonymous caller is denied execute on admin_create_game');

select pg_temp.ok(
  (select count(*) from public.venues where id = '11110000-0000-0000-0000-000000000e01') = 1,
  'venues stay publicly readable for the anonymous game page');

reset role;

-- =============================================================================
-- admin_update_game — no status writes, no terminal edits, forward-only price
-- =============================================================================

do $$
declare v_game uuid; v_player uuid; v_booking uuid;
begin
  -- A published game with one confirmed booking at the old price.
  insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status)
  values ('22220000-0000-0000-0000-000000000e02', 'Test Pitch',
          '11110000-0000-0000-0000-000000000e01', now() + interval '4 days', 10, 200, 'published')
  returning id into v_game;

  insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk)
  values ('33330000-0000-0000-0000-000000000e03', v_game,
          'bbbb0000-0000-0000-0000-0000000b1001', 'cash', 'confirmed', 200)
  returning id into v_booking;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-0000-0000-0000000ad001', 'role', 'authenticated')::text, true);

  perform public.admin_update_game(v_game, '11110000-0000-0000-0000-000000000e01',
                                   now() + interval '4 days', 350, '5v5', 'indoor', 'New notes');
  reset role;

  perform pg_temp.ok(
    (select price_czk = 350 and format = '5v5' and surface = 'indoor'
       from public.games where id = v_game),
    'admin_update_game writes the new price and detail columns');

  perform pg_temp.ok(
    (select status = 'published' from public.games where id = v_game),
    'admin_update_game leaves status untouched');

  perform pg_temp.ok(
    (select price_czk = 200 from public.bookings where id = v_booking),
    'an existing booking keeps the price it was made at after a reprice');
end $$;

update public.games set status = 'settled' where id = '22220000-0000-0000-0000-000000000e02';

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ad001');
select pg_temp.ok_call(
  $q$select public.admin_update_game('22220000-0000-0000-0000-000000000e02', '11110000-0000-0000-0000-000000000e01', now() + interval '4 days', 400)$q$,
  'raise:INVALID_TRANSITION',
  'a settled game cannot be edited');
reset role;

-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
