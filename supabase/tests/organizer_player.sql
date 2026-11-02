-- =============================================================================
-- ROUND 42 — the organizer is a player, and the game page shows their photo.
--
-- The owner: "on every game card we have an organizer. it currently doesn't
-- show an image/profile pic. I'd like that to be visible" — and he chose to
-- PICK the organizer from the players rather than match a typed name.
--
--   * only an admin links a game's organizer to a player, or clears the link
--   * the link is to a live account: not a deleted one, not a guest row
--   * anyone who may see the game may see the organizer's nickname and photo,
--     and nobody may see them for a draft or a cancelled game
--   * re-saving the organizer's name, phone or handle keeps the link
--   * deleting the player's account leaves the game with initials, not a ghost
--
-- Run:  node supabase/tests/run.mjs organizer_player
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

insert into auth.users (id, email)
select ('42420000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r42-' || n || '@test.invalid'
  from generate_series(1, 3) n;

insert into public.players (id, nickname, email, auth_user_id, is_admin, photo_path) values
  ('4e420000-0000-0000-0000-000000000001', 'R42Admin',  'r42-1@test.invalid', '42420000-0000-0000-0000-000000000001', true,  null),
  ('4e420000-0000-0000-0000-000000000002', 'R42Runner', 'r42-2@test.invalid', '42420000-0000-0000-0000-000000000002', false, 'players/4e420000-0000-0000-0000-000000000002.webp'),
  ('4e420000-0000-0000-0000-000000000003', 'R42Gone',   'r42-3@test.invalid', '42420000-0000-0000-0000-000000000003', false, 'players/4e420000-0000-0000-0000-000000000003.webp');

-- A guest row: a player with no account behind it.
insert into public.players (id, nickname, email) values
  ('4e420000-0000-0000-0000-000000000004', 'R42Guest', 'r42-guest@test.invalid');

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94242000-0000-0000-0000-0000000000a1', 'R42 Published', now() + interval '3 days', 12, 180, 'published', 90),
  ('94242000-0000-0000-0000-0000000000a2', 'R42 Draft',     now() + interval '4 days', 12, 180, 'draft',     90);

insert into public.game_organizer_contacts (game_id, organizer_name, organizer_phone) values
  ('94242000-0000-0000-0000-0000000000a1', 'Runner', '+420600000000'),
  ('94242000-0000-0000-0000-0000000000a2', 'Runner', null);

-- =============================================================================
-- WHO MAY LINK
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000002'::uuid)$q$,
  'denied', 'a signed-out visitor cannot call it at all');
reset role;

select pg_temp.act_as('42420000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000002'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot name themselves the organizer');
reset role;

select pg_temp.act_as('42420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000004'::uuid)$q$,
  'raise:PLAYER_NOT_FOUND', 'a guest row has no profile to show, so it cannot be the organizer');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('00000000-0000-0000-0000-000000000000'::uuid, '4e420000-0000-0000-0000-000000000002'::uuid)$q$,
  'raise:GAME_NOT_FOUND', 'nor can a game that does not exist get one');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000002'::uuid)$q$,
  'rows:1', 'an admin links the organizer to a player');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a2'::uuid, '4e420000-0000-0000-0000-000000000002'::uuid)$q$,
  'rows:1', 'and on a draft, which is where a game is usually set up');
reset role;

-- =============================================================================
-- WHO MAY SEE
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok(
  (select nickname = 'R42Runner' and photo_path = 'players/4e420000-0000-0000-0000-000000000002.webp'
     from public.game_organizer_profile('94242000-0000-0000-0000-0000000000a1')),
  'a signed-out visitor sees the organizer''s nickname and photo on a published game');
select pg_temp.ok(
  not exists (select 1 from public.game_organizer_profile('94242000-0000-0000-0000-0000000000a2')),
  'and nothing at all for a draft — an unpublished game is not public, nor is who runs it');
reset role;

-- =============================================================================
-- THE LINK SURVIVES A RE-SAVE, AND CLEARS
-- =============================================================================

select pg_temp.act_as('42420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer('94242000-0000-0000-0000-0000000000a1'::uuid, 'Runner R.', '+420600000001', null)$q$,
  'rows:1', 'an admin re-saves the organizer''s name and number, as every game edit does');
reset role;
select pg_temp.ok(
  (select organizer_player_id = '4e420000-0000-0000-0000-000000000002'
     from public.game_organizer_contacts where game_id = '94242000-0000-0000-0000-0000000000a1'),
  'and the link to the player is still there');

select pg_temp.act_as('42420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a2'::uuid, null)$q$,
  'rows:1', 'an admin clears the link');
reset role;
select pg_temp.ok(
  (select organizer_player_id is null
     from public.game_organizer_contacts where game_id = '94242000-0000-0000-0000-0000000000a2'),
  'and the organizer is a typed name again');

-- =============================================================================
-- A DELETED ACCOUNT
-- =============================================================================

select pg_temp.act_as('42420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000003'::uuid)$q$,
  'rows:1', 'an admin links a second player');
reset role;

update public.players set auth_user_id = null, deleted_at = now()
 where id = '4e420000-0000-0000-0000-000000000003';

select pg_temp.act_as_anon();
select pg_temp.ok(
  not exists (select 1 from public.game_organizer_profile('94242000-0000-0000-0000-0000000000a1')),
  'once that account is deleted, the game shows no face — initials, not a ghost');
reset role;

select pg_temp.act_as('42420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_organizer_player('94242000-0000-0000-0000-0000000000a1'::uuid, '4e420000-0000-0000-0000-000000000003'::uuid)$q$,
  'raise:PLAYER_NOT_FOUND', 'and a deleted account cannot be linked again');
reset role;

-- =============================================================================
-- CAPABILITIES
-- =============================================================================

select pg_temp.ok(
  (public.app_capabilities() ->> 'organizerPlayer')::boolean,
  'app_capabilities reports organizerPlayer');

select pg_temp.ok(
  not exists (select 1 from jsonb_each(public.app_capabilities()) where value <> 'true'::jsonb),
  'and every flag it reports is true', public.app_capabilities()::text);

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
