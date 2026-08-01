-- =============================================================================
-- Migrations 26 + 27 assertions — game detail columns, and the organizer phone
--
-- Run:  node supabase/tests/run.mjs game_organizer_contacts
--
-- Transaction-wrapped and rolled back. `call()` consumes the value it selects,
-- so a privilege check cannot pass by having its function call pruned.
--
-- RISK R2 IS THE POINT OF THIS SUITE. The phone is off `games` because SELECT
-- there is granted table-wide to `anon`; this file exists to prove the
-- replacement actually withholds it. Every route an anonymous or uninvolved
-- caller could take is tried: the table, the function, and the games row it
-- used to live on.
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
  when check_violation then return 'check_violation';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || split_part(sqlerrm, ':', 1); end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.do_stmt(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when insufficient_privilege then return 'denied';
  when check_violation then return 'check_violation';
  when others then return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.ok_do(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.do_stmt(sql);
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
  ('a0000000-0000-0000-0000-0000000fe001'::uuid, 'og-admin@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fe002'::uuid, 'og-booked@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fe003'::uuid, 'og-nobooking@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fe004'::uuid, 'og-cancelled@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('bbbb0000-0000-0000-0000-0000000fe001'::uuid, 'OgAdmin', 'og-admin@test.invalid',
   'a0000000-0000-0000-0000-0000000fe001'::uuid, true),
  ('bbbb0000-0000-0000-0000-0000000fe002'::uuid, 'OgBooked', 'og-booked@test.invalid',
   'a0000000-0000-0000-0000-0000000fe002'::uuid, false),
  ('bbbb0000-0000-0000-0000-0000000fe003'::uuid, 'OgNoBooking', 'og-nobooking@test.invalid',
   'a0000000-0000-0000-0000-0000000fe003'::uuid, false),
  ('bbbb0000-0000-0000-0000-0000000fe004'::uuid, 'OgCancelled', 'og-cancelled@test.invalid',
   'a0000000-0000-0000-0000-0000000fe004'::uuid, false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status,
                          duration_minutes, allowed_skill_levels, subs_per_team, format) values
  ('cccc0000-0000-0000-0000-0000000fe001'::uuid, 'Og Published', now() + interval '3 days',
   12, 200, 'published', 90, array['advanced']::public.skill_level[], 2, '5v5'),
  ('cccc0000-0000-0000-0000-0000000fe002'::uuid, 'Og Draft', now() + interval '4 days',
   12, 200, 'draft', null, null, null, null);

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk) values
  ('dddd0000-0000-0000-0000-0000000fe001'::uuid, 'cccc0000-0000-0000-0000-0000000fe001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fe002'::uuid, 'confirmed', 'cash', 200),
  ('dddd0000-0000-0000-0000-0000000fe002'::uuid, 'cccc0000-0000-0000-0000-0000000fe001'::uuid,
   'bbbb0000-0000-0000-0000-0000000fe004'::uuid, 'cancelled', 'cash', 200);

-- =============================================================================
-- migration 26 — the descriptive columns constrain nothing
-- =============================================================================

select pg_temp.ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'games'
     and column_name in ('duration_minutes', 'allowed_skill_levels', 'subs_per_team')
     and is_nullable = 'YES') = 3,
  'all three game detail columns exist and are nullable');

-- Format is stored verbatim. A 12-capacity game reading "5v5" is the whole
-- point of §5.3a: nothing derives one from the other.
select pg_temp.ok(
  (select format from public.games where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid) = '5v5'
  and (select capacity from public.games where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid) = 12,
  'a 12-capacity game keeps the format the admin typed, not one derived from capacity');

select pg_temp.ok_do(
  $q$update public.games set duration_minutes = 15
     where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid$q$,
  'check_violation', 'a duration under 30 minutes is refused');
select pg_temp.ok_do(
  $q$update public.games set duration_minutes = 240
     where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid$q$,
  'check_violation', 'a duration over 180 minutes is refused');
select pg_temp.ok_do(
  $q$update public.games set subs_per_team = -1
     where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid$q$,
  'check_violation', 'a negative substitute count is refused');
select pg_temp.ok_do(
  $q$update public.games set subs_per_team = 0
     where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid$q$,
  'ok', 'zero substitutes is a legitimate answer, not a missing one');

-- All-levels is NULL, never an empty array: one way to say a thing, so
-- "is null" is the whole test for "no badge anywhere".
select pg_temp.ok_do(
  $q$update public.games set allowed_skill_levels = '{}'::public.skill_level[]
     where id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid$q$,
  'check_violation', 'an empty skill array is refused — all-levels is NULL');

-- =============================================================================
-- the organizer table itself is unreachable from a client
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe001'::uuid);
select pg_temp.ok_do(
  $q$select public.set_game_organizer('cccc0000-0000-0000-0000-0000000fe001'::uuid,
      'Oliver', '+420600123456')$q$,
  'ok', 'an admin can record the organizer contact');

select pg_temp.ok_call(
  $q$select public.set_game_organizer('cccc0000-0000-0000-0000-0000000fe002'::uuid, '  ')$q$,
  'raise:ORGANIZER_NAME_REQUIRED', 'a blank organizer name is refused');

select pg_temp.ok_call(
  $q$select public.set_game_organizer('99990000-0000-0000-0000-00000000dead'::uuid, 'Ghost')$q$,
  'raise:GAME_NOT_FOUND', 'recording a contact for a game that does not exist is refused');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe003'::uuid);
select pg_temp.ok_call(
  $q$select public.set_game_organizer('cccc0000-0000-0000-0000-0000000fe001'::uuid, 'Impostor')$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a non-admin cannot set the organizer contact');

-- The table itself: no grant, so this is refused before RLS is consulted.
select pg_temp.ok_call(
  $q$select count(_p::text) from (select organizer_phone
      from public.game_organizer_contacts) _p$q$,
  'denied', 'a signed-in player cannot read the contacts table at all');
reset role;

set local role anon;
select pg_temp.ok_call(
  $q$select count(_p::text) from (select organizer_phone
      from public.game_organizer_contacts) _p$q$,
  'denied', 'an anonymous caller cannot read the contacts table at all');

-- The route that would have existed had the phone gone on `games`, tried
-- explicitly. This is the assertion R2 is about.
select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games'
      and column_name like '%phone%'),
  'there is no phone column on `games`, where SELECT is granted table-wide to anon');
reset role;

-- =============================================================================
-- the two exits behave differently, which is the whole design
-- =============================================================================

-- The NAME is public, for a published game.
set local role anon;
select pg_temp.ok_call(
  $q$select public.game_organizer_public('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  'Oliver', 'anyone can see who is running a published game');
select pg_temp.ok_call(
  $q$select public.game_organizer_phone('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  'denied', 'anon holds no execute privilege on the phone function');
reset role;

-- A draft game is not public, and neither is its organizer.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe001'::uuid);
select pg_temp.ok_do(
  $q$select public.set_game_organizer('cccc0000-0000-0000-0000-0000000fe002'::uuid, 'Draft Org')$q$,
  'ok', 'the admin records a contact on the draft game too');
reset role;
set local role anon;
select pg_temp.ok_call(
  $q$select public.game_organizer_public('cccc0000-0000-0000-0000-0000000fe002'::uuid)$q$,
  'null', 'a draft game does not publish its organizer');
reset role;

-- The PHONE, tried as each kind of caller.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe002'::uuid);
select pg_temp.ok_call(
  $q$select public.game_organizer_phone('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  '+420600123456', 'a player holding a confirmed booking gets the phone');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe003'::uuid);
select pg_temp.ok_call(
  $q$select public.game_organizer_phone('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  'null', 'a signed-in player with no booking on that game gets nothing');
reset role;

-- A cancelled booking is not a reason to hold the organizer's number.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe004'::uuid);
select pg_temp.ok_call(
  $q$select public.game_organizer_phone('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  'null', 'a cancelled booking does not keep access to the phone');
reset role;

-- Null for refusal AND for absence, deliberately: distinguishing them would
-- leak whether a phone exists to someone not allowed to have it.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe001'::uuid);
select pg_temp.ok_do(
  $q$select public.set_game_organizer('cccc0000-0000-0000-0000-0000000fe001'::uuid, 'Oliver', '   ')$q$,
  'ok', 'a blank phone is accepted and stored as absent');
reset role;
select pg_temp.ok(
  (select organizer_phone from public.game_organizer_contacts
   where game_id = 'cccc0000-0000-0000-0000-0000000fe001'::uuid) is null,
  'a whitespace phone is stored as NULL, not as an empty string');

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fe002'::uuid);
select pg_temp.ok_call(
  $q$select public.game_organizer_phone('cccc0000-0000-0000-0000-0000000fe001'::uuid)$q$,
  'null',
  'absence and refusal are the same answer to the caller, by design');
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
