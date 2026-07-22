-- =============================================================================
-- Migration 20 assertions — game_waitlist_public + set_player_admin
--
-- Run:  node supabase/tests/run.mjs waitlist_public_and_admin_grant
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
-- `call()` consumes the value it selects (POLISH.md).
--
-- The view half is written against the ANON role specifically: anon is the
-- threat model for a public projection of player data, exactly as in
-- 04_game_roster_public.sql.
--
-- The RPC half concentrates on the one property the "dashboard only" rule used
-- to buy — that nobody can elevate themselves — because that is what migration
-- 20 has to keep true by other means.
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
    if sqlstate = 'P0001' then return 'raise:' || split_part(sqlerrm, ':', 1); end if;
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
  ('a0000000-0000-0000-0000-0000000fa001'::uuid, 'wl-admin@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fa002'::uuid, 'wl-admin2@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fa003'::uuid, 'wl-player@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('bbbb0000-0000-0000-0000-0000000fa001'::uuid, 'WlAdmin',   'wl-admin@test.invalid',  'a0000000-0000-0000-0000-0000000fa001'::uuid, true),
  ('bbbb0000-0000-0000-0000-0000000fa002'::uuid, 'WlAdmin2',  'wl-admin2@test.invalid', 'a0000000-0000-0000-0000-0000000fa002'::uuid, true),
  ('bbbb0000-0000-0000-0000-0000000fa003'::uuid, 'WlPlayer',  'wl-player@test.invalid', 'a0000000-0000-0000-0000-0000000fa003'::uuid, false),
  ('bbbb0000-0000-0000-0000-0000000fa004'::uuid, 'WlShadow',  null, null, false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('cccc0000-0000-0000-0000-0000000fa001'::uuid, 'WL Published', now() + interval '8 days', 12, 200, 'published'),
  ('cccc0000-0000-0000-0000-0000000fa002'::uuid, 'WL Draft',     now() + interval '9 days', 12, 200, 'draft'),
  ('cccc0000-0000-0000-0000-0000000fa003'::uuid, 'WL Cancelled', now() + interval '9 days', 12, 200, 'cancelled');

-- A queue on the published game, in a deliberately non-alphabetical join order
-- so `position` cannot pass by accidentally agreeing with the nickname sort.
insert into public.waitlist (id, game_id, player_id, joined_at) values
  ('dddd0000-0000-0000-0000-0000000fa001'::uuid, 'cccc0000-0000-0000-0000-0000000fa001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fa003'::uuid, now() - interval '3 hours'),
  ('dddd0000-0000-0000-0000-0000000fa002'::uuid, 'cccc0000-0000-0000-0000-0000000fa001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fa002'::uuid, now() - interval '2 hours'),
  ('dddd0000-0000-0000-0000-0000000fa003'::uuid, 'cccc0000-0000-0000-0000-0000000fa001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fa001'::uuid, now() - interval '1 hour');

-- Same queue shape on the hidden games, so a leak would have something to leak.
insert into public.waitlist (game_id, player_id) values
  ('cccc0000-0000-0000-0000-0000000fa002'::uuid, 'bbbb0000-0000-0000-0000-0000000fa003'::uuid),
  ('cccc0000-0000-0000-0000-0000000fa003'::uuid, 'bbbb0000-0000-0000-0000-0000000fa003'::uuid);

-- =============================================================================
-- game_waitlist_public — projection, as ANON
-- =============================================================================

set local role anon;

select pg_temp.ok(
  (select array_agg(column_name::text order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_waitlist_public')
  = array['game_id', 'nickname', 'position'],
  'the view projects EXACTLY game_id, nickname, position',
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_waitlist_public'));

select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_waitlist_public'
       and column_name in ('player_id', 'joined_at', 'notified_at',
                           'converted_booking_id', 'email', 'phone', 'id')),
  'the view exposes no player_id, joined_at, notified_at, converted_booking_id or contact data');

-- =============================================================================
-- game-status filter — the enforcement point that must live in the view body
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa002'::uuid) = 0,
  'a DRAFT game returns zero waitlist rows');

select pg_temp.ok(
  (select count(*) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa003'::uuid) = 0,
  'a CANCELLED game returns zero waitlist rows');

select pg_temp.ok(
  (select count(*) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid) = 3,
  'a PUBLISHED game returns its whole queue',
  'count=' || (select count(*) from public.game_waitlist_public
                where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid));

-- =============================================================================
-- position — joined_at order, and only that
-- =============================================================================

select pg_temp.ok(
  (select array_agg(nickname order by position) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid)
  = array['WlPlayer', 'WlAdmin2', 'WlAdmin'],
  'position ranks by joined_at, not by nickname or insertion id',
  (select string_agg(nickname || '#' || position, ' ' order by position)
     from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid));

select pg_temp.ok(
  (select array_agg(position order by position) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid) = array[1, 2, 3],
  'position is 1-based and gapless within a game');

-- anon can genuinely read it — otherwise every filter above passes vacuously.
select pg_temp.ok(
  (select nickname from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid and position = 1) = 'WlPlayer',
  'anon can actually read the view (filters above are not passing vacuously)');

reset role;

-- =============================================================================
-- a converted row leaves the queue
-- =============================================================================

insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk) values
  ('eeee0000-0000-0000-0000-0000000fa001'::uuid, 'cccc0000-0000-0000-0000-0000000fa001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fa003'::uuid, 'cash', 'confirmed', 200);

update public.waitlist
   set converted_booking_id = 'eeee0000-0000-0000-0000-0000000fa001'::uuid
 where id = 'dddd0000-0000-0000-0000-0000000fa001'::uuid;

set local role anon;

select pg_temp.ok(
  not exists (select 1 from public.game_waitlist_public
               where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid
                 and nickname = 'WlPlayer'),
  'a converted waitlist row leaves the public queue');

select pg_temp.ok(
  (select array_agg(nickname order by position) from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid)
  = array['WlAdmin2', 'WlAdmin'],
  'the remaining queue renumbers from 1 after a conversion',
  (select string_agg(nickname || '#' || position, ' ' order by position)
     from public.game_waitlist_public
    where game_id = 'cccc0000-0000-0000-0000-0000000fa001'::uuid));

reset role;

-- =============================================================================
-- set_player_admin — authorization
-- =============================================================================

-- A non-admin cannot grant themselves. THE property migration 20 must preserve.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fa003'::uuid);
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa003'::uuid, true)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot grant themselves admin');
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa004'::uuid, true)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot grant anyone else admin either');
reset role;

select pg_temp.ok(
  (select is_admin from public.players
    where id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid) = false,
  'the refused self-grant wrote nothing');

-- An anonymous caller has no execute privilege at all.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa003'::uuid, true)$q$,
  'denied',
  'an anonymous caller is denied execute on set_player_admin');
reset role;

-- Service role is deliberately NOT a permitted caller here, unlike every other
-- admin RPC: nothing about minting privilege is a machine's job.
select pg_temp.ok(
  not has_function_privilege('service_role',
    'public.set_player_admin(uuid, boolean)', 'execute'),
  'service_role has no execute privilege on set_player_admin');

-- =============================================================================
-- set_player_admin — the self-change refusal
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fa001'::uuid);

select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa001'::uuid, false)$q$,
  'raise:CANNOT_CHANGE_OWN_ADMIN',
  'an admin cannot revoke their own admin flag');

select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa001'::uuid, true)$q$,
  'raise:CANNOT_CHANGE_OWN_ADMIN',
  'an admin cannot re-assert their own admin flag either (no self-subject path exists)');

-- =============================================================================
-- set_player_admin — the happy paths
-- =============================================================================

select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa003'::uuid, true)$q$,
  'true',
  'an admin grants another player admin');

reset role;

select pg_temp.ok(
  (select is_admin from public.players
    where id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid) = true,
  'the grant is written to players.is_admin');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'admin_granted'
      and player_id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid) = 1,
  'the grant emits exactly one admin_granted event');

select pg_temp.ok(
  (select metadata->>'by_player_id' from public.events
    where event_type = 'admin_granted'
      and player_id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid)
  = 'bbbb0000-0000-0000-0000-0000000fa001',
  'the event names the granting admin, so the grant chain is reconstructable');

-- Idempotence: re-granting an existing admin writes no second event.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fa001'::uuid);
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa003'::uuid, true)$q$,
  'true',
  're-granting an existing admin succeeds');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'admin_granted'
      and player_id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid) = 1,
  're-granting writes no second event (a no-op is not an audit entry)');

-- Revocation, by a different admin.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fa002'::uuid);
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa003'::uuid, false)$q$,
  'false',
  'an admin revokes another admin');
reset role;

select pg_temp.ok(
  (select is_admin from public.players
    where id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid) = false,
  'the revocation is written to players.is_admin');

select pg_temp.ok(
  (select metadata->>'by_player_id' from public.events
    where event_type = 'admin_revoked'
      and player_id = 'bbbb0000-0000-0000-0000-0000000fa003'::uuid)
  = 'bbbb0000-0000-0000-0000-0000000fa002',
  'the revocation event names the revoking admin');

-- A shadow player (no auth user) can still be granted: the flag is on the
-- player row, and the shadow becomes an admin the moment its email claims a
-- session. Nothing about that is a self-elevation path.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fa001'::uuid);
select pg_temp.ok_call(
  $q$select public.set_player_admin('bbbb0000-0000-0000-0000-0000000fa004'::uuid, true)$q$,
  'true',
  'a shadow player can be granted admin');
select pg_temp.ok_call(
  $q$select public.set_player_admin('99990000-0000-0000-0000-00000000dead'::uuid, true)$q$,
  'raise:PLAYER_NOT_FOUND',
  'granting a player that does not exist is refused');
reset role;

-- =============================================================================
-- results
-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select
  count(*) as total,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed,
  case when count(*) filter (where not passed) = 0
       then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
