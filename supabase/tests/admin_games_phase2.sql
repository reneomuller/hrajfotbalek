-- =============================================================================
-- Phase 13 assertions — admin_create_game_v2 / admin_update_game_v2
--
-- Run:  node supabase/tests/run.mjs admin_games_phase2
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- What this suite is really about is REQ-GAME-017: format is what the admin
-- typed and is NEVER derived from capacity. That is asserted with the exact
-- case the contract names — a 12-capacity game saved as "5v5" — because the
-- failure mode is not an error, it is a confident falsehood on a public page.
--
-- `call()` is the value-consuming probe (POLISH.md): `count(*)` never reads a
-- column, so the planner can prune a non-volatile call and report success
-- where a direct call is denied. Everything here goes through `call()`.
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

-- --- reading the result, from outside the acting role -------------------------
--
-- The assertions below inspect rows the ACTING ROLE deliberately cannot see,
-- and that is the point rather than an inconvenience:
--
--   * a freshly created game is a `draft`, and `games_select_public` admits
--     only published/full/played/settled — so an `authenticated` read of it
--     returns no row and every assertion would quietly pass on NULL;
--   * `game_organizer_contacts` has NO grants to `anon` or `authenticated` at
--     all (§5.1), so reading it as one raises rather than returning empty.
--
-- Both are correct behaviour being asserted elsewhere in this suite. These two
-- SECURITY DEFINER readers exist so the *state* checks are made as the suite
-- owner, and the *access* checks stay explicit and separate. Mixing the two is
-- how a suite ends up proving nothing at all.

create function pg_temp.gamerow(p_game uuid)
returns public.games language sql security definer as $$
  select * from public.games where id = p_game;
$$;

create function pg_temp.contactrow(p_game uuid)
returns public.game_organizer_contacts language sql security definer as $$
  select * from public.game_organizer_contacts where game_id = p_game;
$$;

create function pg_temp.contact_count(p_game uuid)
returns bigint language sql security definer as $$
  select count(*) from public.game_organizer_contacts where game_id = p_game;
$$;

-- Fixture lever, not a product path. `authenticated` holds column-scoped UPDATE
-- on `games` and `status` is deliberately NOT among those columns — a status
-- write from a session is a permission error, which is the invariant, not an
-- obstacle. The suite needs published and settled games to test against, so it
-- stamps them as the owner and says so.
create function pg_temp.force_status(p_game uuid, p_status public.game_status)
returns void language sql security definer as $$
  update public.games set status = p_status where id = p_game;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000ad013', 'admin-13@test.invalid'),
  ('b0000000-0000-0000-0000-0000000b1013', 'player-13@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-0000000ad013', 'Admin13',  'admin-13@test.invalid',  'a0000000-0000-0000-0000-0000000ad013', true),
  ('bbbb0000-0000-0000-0000-0000000b1013', 'Player13', 'player-13@test.invalid', 'b0000000-0000-0000-0000-0000000b1013', false);

insert into public.venues (id, name, image_path) values
  ('11110000-0000-0000-0000-000000000f13', 'Phase13 Pitch', '/venues/p13.jpg');

-- =============================================================================
-- REQ-GAME-017 — format is verbatim, and capacity implies nothing
--
-- The contract names this exact case: capacity 12, format "5v5", read back
-- "5v5". A 12-capacity game may be 5v5 with substitutes; inferring "6v6" from
-- the number would print a confident falsehood.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ad013');

do $$
declare v_id uuid;
begin
  v_id := public.admin_create_game_v2(
    p_venue_id             => '11110000-0000-0000-0000-000000000f13',
    p_starts_at            => now() + interval '3 days',
    p_capacity             => 12,
    p_price_czk            => 200,
    p_organizer_name       => 'Admin13',
    p_format               => '5v5',
    p_surface              => 'turf',
    p_notes                => 'Gate code 4321',
    p_organizer_phone      => '+420777123456',
    p_duration_minutes     => 90,
    p_allowed_skill_levels => array['advanced']::public.skill_level[],
    p_subs_per_team        => 2
  );

  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).format = '5v5' and (pg_temp.gamerow(v_id)).capacity = 12,
    'a 12-capacity game saved as 5v5 reads back 5v5 — format is never derived from capacity');

  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).status = 'draft',
    'admin_create_game_v2 produces a draft, never a published game');

  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).duration_minutes = 90
      and (pg_temp.gamerow(v_id)).subs_per_team = 2
      and (pg_temp.gamerow(v_id)).allowed_skill_levels = array['advanced']::public.skill_level[],
    'duration, substitutes and the skill restriction round-trip');

  -- REQ-GAME-015 / F3: the legacy NOT NULL text column is still populated.
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).venue = 'Phase13 Pitch'
      and (pg_temp.gamerow(v_id)).venue_id = '11110000-0000-0000-0000-000000000f13',
    'the legacy games.venue column is still written from the venue name');

  -- REQ-GAME-001: the organizer lands in the SAME transaction as the game.
  perform pg_temp.ok(
    (pg_temp.contactrow(v_id)).organizer_name = 'Admin13'
      and (pg_temp.contactrow(v_id)).organizer_phone = '+420777123456',
    'the organizer contact is written in the same transaction as the game');
end $$;

-- =============================================================================
-- Server-side validation — the named errors the form renders
-- =============================================================================

select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
       'Admin13', null, null, null, null, 20)$q$,
  'raise:INVALID_DURATION',
  'a 20-minute duration is refused by the function, not only by the CHECK');

select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
       'Admin13', null, null, null, null, 240)$q$,
  'raise:INVALID_DURATION',
  'a 240-minute duration is refused');

select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
       'Admin13', null, null, null, null, 60, null, 25)$q$,
  'raise:INVALID_SUBS',
  '25 substitutes per team is refused');

select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
       '   ')$q$,
  'raise:ORGANIZER_NAME_REQUIRED',
  'a blank organizer name is refused — the field is required, not merely labelled so');

-- 30 and 180 are inside the range, so the boundary is inclusive on both ends.
do $$
declare v_id uuid;
begin
  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
    'Admin13', null, null, null, null, 30);
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).duration_minutes = 30,
    '30 minutes is accepted — the lower bound is inclusive');

  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100,
    'Admin13', null, null, null, null, 180);
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).duration_minutes = 180,
    '180 minutes is accepted — the upper bound is inclusive');
end $$;

-- =============================================================================
-- normalize_skill_levels — one way to say "all levels"
--
-- NULL, an empty array and all-three-levels all mean the same thing. They must
-- STORE the same thing, so every render site's test for "no badge" stays
-- `allowed_skill_levels is null` and nothing grows its own opinion.
-- =============================================================================

do $$
declare v_id uuid;
begin
  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '2 days', 10, 100,
    'Admin13', null, null, null, null, 60,
    array['beginner','intermediate','advanced']::public.skill_level[]);
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).allowed_skill_levels is null,
    'all three levels selected stores NULL — the same thing as "all levels"');

  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '2 days', 10, 100,
    'Admin13', null, null, null, null, 60,
    array[]::public.skill_level[]);
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).allowed_skill_levels is null,
    'an empty selection stores NULL rather than "restricted to nothing"');

  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '2 days', 10, 100,
    'Admin13', null, null, null, null, 60,
    array['advanced','beginner','advanced']::public.skill_level[]);
  perform pg_temp.ok(
    (pg_temp.gamerow(v_id)).allowed_skill_levels
      = array['beginner','advanced']::public.skill_level[],
    'duplicates are collapsed and the order is stable, so badges do not flap');
end $$;

-- =============================================================================
-- Authorization — the check is inside the function, not in the route
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-0000000b1013');
select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100, 'Player13')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin player cannot create a game through the v2 function');

reset role;
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
select pg_temp.ok_call(
  $q$select public.admin_create_game_v2(
       '11110000-0000-0000-0000-000000000f13', now() + interval '1 day', 10, 100, 'Nobody')$q$,
  'denied',
  'anon is denied EXECUTE on admin_create_game_v2 — the revoke, not the body, refuses it');

select pg_temp.ok_call(
  $q$select public.admin_update_game_v2(
       '00000000-0000-0000-0000-0000000000aa',
       '11110000-0000-0000-0000-000000000f13', now(), 100, 'Nobody')$q$,
  'denied',
  'anon is denied EXECUTE on admin_update_game_v2');

-- =============================================================================
-- The service-role path, which is where this migration found a real defect
--
-- Migration 27 guarded `set_game_organizer` with `is_admin_caller()` alone,
-- unlike every other admin write in this codebase. `admin_create_game_v2`
-- calls it, so a service-role caller — the seed script, the E2E scaffold, a
-- future bank poller — passed the OUTER check and was refused by the INNER
-- one, mid-transaction, with a message naming a function it never invoked.
--
-- Asserted here rather than only fixed, because the failure was invisible
-- until something outside a browser session tried to create a game.
-- =============================================================================

reset role;
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);

do $$
declare v_id uuid;
begin
  v_id := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '9 days', 10, 200,
    'Service Organizer', null, null, null, '+420600111222');

  perform pg_temp.ok(
    v_id is not null and (pg_temp.contactrow(v_id)).organizer_name = 'Service Organizer',
    'a service-role caller can create a game AND its organizer — the inner guard no longer refuses it');
end $$;

select pg_temp.ok_call(
  $q$select public.set_game_organizer('99990000-0000-0000-0000-00000000dead'::uuid, 'Ghost')$q$,
  'raise:GAME_NOT_FOUND',
  'the widened guard still refuses a game that does not exist, rather than admitting anything');

reset role;

-- =============================================================================
-- admin_update_game_v2 — edits, upserts the organizer, touches no status
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ad013');

do $$
declare
  v_game uuid;
begin
  v_game := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '5 days', 10, 200,
    'Admin13', '6v6', 'grass', null, '+420777000111', 60,
    array['beginner']::public.skill_level[], 1);

  perform pg_temp.force_status(v_game, 'published');

  perform public.admin_update_game_v2(
    p_game_id              => v_game,
    p_venue_id             => '11110000-0000-0000-0000-000000000f13',
    p_starts_at            => now() + interval '6 days',
    p_price_czk            => 250,
    p_organizer_name       => 'Someone Else',
    p_format               => '7v7',
    p_surface              => 'indoor',
    p_notes                => 'Bring water',
    p_organizer_phone      => null,
    p_duration_minutes     => 120,
    p_allowed_skill_levels => null,
    p_subs_per_team        => null
  );

  perform pg_temp.ok(
    (pg_temp.gamerow(v_game)).price_czk = 250
      and (pg_temp.gamerow(v_game)).format = '7v7'
      and (pg_temp.gamerow(v_game)).surface = 'indoor'
      and (pg_temp.gamerow(v_game)).duration_minutes = 120
      and (pg_temp.gamerow(v_game)).subs_per_team is null
      and (pg_temp.gamerow(v_game)).allowed_skill_levels is null,
    'admin_update_game_v2 writes every editable column, including back to NULL');

  perform pg_temp.ok(
    (pg_temp.gamerow(v_game)).status = 'published',
    'admin_update_game_v2 leaves status untouched');

  perform pg_temp.ok(
    (pg_temp.gamerow(v_game)).capacity = 10,
    'admin_update_game_v2 does not touch capacity — set_game_capacity owns that rule');

  -- The upsert, and the "blank phone is NULL" rule inherited from
  -- set_game_organizer: clearing the field must clear the number, not store ''.
  perform pg_temp.ok(
    (pg_temp.contactrow(v_game)).organizer_name = 'Someone Else'
      and (pg_temp.contactrow(v_game)).organizer_phone is null,
    'the organizer is upserted, and a cleared phone becomes NULL rather than an empty string');

  perform pg_temp.ok(
    pg_temp.contact_count(v_game) = 1,
    'the upsert leaves exactly one contact row, not a second one');
end $$;

-- A terminal game is history: its time and price are what the roster and the
-- ledger already agreed on.
do $$
declare v_game uuid;
begin
  v_game := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '7 days', 10, 200, 'Admin13');
  perform pg_temp.force_status(v_game, 'settled');

  perform pg_temp.ok(
    pg_temp.call(format(
      $q$select public.admin_update_game_v2(%L, '11110000-0000-0000-0000-000000000f13', now(), 400, 'Admin13')$q$,
      v_game)) = 'raise:INVALID_TRANSITION',
    'a settled game cannot be edited through the v2 function either');
end $$;

reset role;

-- =============================================================================
-- The phone written here is still unreachable by the routes §5.1 closed
--
-- Phase 12 proved the gate on rows inserted directly. This re-proves it on a
-- row the ADMIN FORM's own path created, because a new writer is exactly how a
-- closed door gets propped open.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ad013');
do $$
declare v_game uuid;
begin
  v_game := public.admin_create_game_v2(
    '11110000-0000-0000-0000-000000000f13', now() + interval '8 days', 10, 200,
    'Admin13', null, null, null, '+420777999888');
  perform pg_temp.force_status(v_game, 'published');

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

  perform pg_temp.ok(
    pg_temp.call(format($q$select public.game_organizer_phone(%L)$q$, v_game)) = 'denied',
    'anon still cannot call game_organizer_phone on a game created by the admin form path');

  perform pg_temp.ok(
    pg_temp.call(format($q$select count(*) from public.game_organizer_contacts where game_id = %L$q$, v_game))
      = 'denied',
    'anon still cannot read the contacts table directly');

  -- A signed-in player with no booking on that game gets NULL, not the number.
  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000b1013');
  perform pg_temp.ok(
    pg_temp.call(format($q$select public.game_organizer_phone(%L)$q$, v_game)) = 'null',
    'a booking-less player gets null from a game created by the admin form path');
end $$;

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
