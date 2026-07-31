-- =============================================================================
-- Migration 23 assertions — complete_signup_v2
--
-- Run:  node supabase/tests/run.mjs complete_signup_v2
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
-- `call()` consumes the value it selects (POLISH.md).
--
-- WHAT MATTERS HERE. This function is the only writer of consent evidence in
-- the system, and the only place a player row is created for a real person. The
-- assertions concentrate on three things a signup function gets wrong quietly:
--
--   1. Identity comes from the session, never from an argument. There is no
--      player-id parameter, and there must be no way to reach one.
--   2. Every named error is actually reachable, in the order a caller would hit
--      it. An error vocabulary nobody has exercised is a set of strings the UI
--      will branch on and never match.
--   3. The row and its event land together. A player without an
--      `account_created` event is invisible to the funnel that decides whether
--      signup works.
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

-- A signup call with everything valid, so each failure case can vary exactly
-- one argument away from a known-good baseline. Otherwise a test that expects
-- COUNTRY_INVALID can pass because the nickname was also wrong.
create function pg_temp.signup(
  p_nick text default 'GoodName',
  p_gdpr text default 'true',
  p_tos text default 'true',
  p_tos_version text default '''v1''',
  p_country text default '''cz''',
  p_skill text default '''intermediate''::public.skill_level',
  p_marketing text default 'false',
  p_phone text default 'null'
) returns text language plpgsql as $$
begin
  return pg_temp.call(format(
    'select public.complete_signup_v2(%L, %s, %s, %s, %s, %s, %s, %s)',
    p_nick, p_gdpr, p_tos, p_tos_version, p_country, p_skill, p_marketing, p_phone));
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000cf01'::uuid, 'cs-new@test.invalid'),
  ('a0000000-0000-0000-0000-00000000cf02'::uuid, 'cs-second@test.invalid'),
  ('a0000000-0000-0000-0000-00000000cf03'::uuid, 'cs-existing@test.invalid');

-- Someone who already completed signup, for the idempotence and
-- nickname-collision cases.
insert into public.players (id, nickname, email, auth_user_id) values
  ('bbbb0000-0000-0000-0000-00000000cf03'::uuid, 'TakenName', 'cs-existing@test.invalid',
   'a0000000-0000-0000-0000-00000000cf03'::uuid);

-- =============================================================================
-- no session, no signup
-- =============================================================================

set local role anon;
select pg_temp.ok_call(
  $q$select public.complete_signup_v2('AnonTry', true, true, 'v1', 'CZ',
      'beginner'::public.skill_level)$q$,
  'denied',
  'anon holds no execute privilege on complete_signup_v2');
reset role;

-- `authenticated` with no `sub` claim is the shape a service-role client has
-- when it forgets to sign in. Reach is not permission.
select pg_temp.ok(
  pg_temp.call($q$select public.complete_signup_v2('NoSub', true, true, 'v1', 'CZ',
      'beginner'::public.skill_level)$q$) = 'raise:INSUFFICIENT_PERMISSION',
  'a session-less caller is refused');

-- =============================================================================
-- the named errors, one argument away from valid each time
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cf01'::uuid);

select pg_temp.ok(pg_temp.signup(p_gdpr := 'false') = 'raise:CONSENT_REQUIRED',
  'GDPR consent is required');
select pg_temp.ok(pg_temp.signup(p_gdpr := 'null') = 'raise:CONSENT_REQUIRED',
  'a null GDPR consent is not consent');

select pg_temp.ok(pg_temp.signup(p_tos := 'false') = 'raise:TOS_REQUIRED',
  'TOS acceptance is required');

-- Separate boxes, separate errors. If one implied the other the two assertions
-- above could not both hold.
select pg_temp.ok(pg_temp.signup(p_gdpr := 'true', p_tos := 'false') = 'raise:TOS_REQUIRED',
  'accepting the terms is not implied by the GDPR consent');
select pg_temp.ok(pg_temp.signup(p_gdpr := 'false', p_tos := 'true') = 'raise:CONSENT_REQUIRED',
  'the GDPR consent is not implied by accepting the terms');

select pg_temp.ok(pg_temp.signup(p_tos_version := 'null') = 'raise:TOS_VERSION_REQUIRED',
  'a TOS acceptance with no version is refused');
select pg_temp.ok(pg_temp.signup(p_tos_version := '''   ''') = 'raise:TOS_VERSION_REQUIRED',
  'a blank TOS version is refused');

select pg_temp.ok(pg_temp.signup(p_nick := 'has<script>') = 'raise:NICKNAME_INVALID',
  'a nickname outside the charset is refused');
select pg_temp.ok(pg_temp.signup(p_nick := 'ThisNicknameIsFarTooLong') = 'raise:NICKNAME_INVALID',
  'a nickname over 20 characters is refused');

-- Case-insensitive, because 'takenname' and 'TakenName' are the same person to
-- everyone except a byte comparison.
select pg_temp.ok(pg_temp.signup(p_nick := 'takenname') = 'raise:NICKNAME_TAKEN',
  'a nickname taken in another case is refused');

select pg_temp.ok(pg_temp.signup(p_country := '''CZE''') = 'raise:COUNTRY_INVALID',
  'a three-letter country code is refused');
select pg_temp.ok(pg_temp.signup(p_country := 'null') = 'raise:COUNTRY_INVALID',
  'a missing country is refused');
select pg_temp.ok(pg_temp.signup(p_country := '''1''') = 'raise:COUNTRY_INVALID',
  'a non-alphabetic country code is refused');

select pg_temp.ok(pg_temp.signup(p_skill := 'null::public.skill_level') = 'raise:SKILL_REQUIRED',
  'a missing skill level is refused');

-- Nothing above may have written a row: every one of them raised.
--
-- Asserted as the suite's own role, not as the player: `events` grants no
-- client role anything at all (v2.5 §8), so reading it while still acting as
-- `authenticated` aborts the transaction with a permission error rather than
-- failing an assertion. The state check and the caller's-eye check are
-- different jobs and need different roles.
reset role;
select pg_temp.ok(
  (select count(*) from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid) = 0,
  'no player row survives any of the refused attempts');
select pg_temp.ok(
  (select count(*) from public.events where event_type = 'account_created'
     and created_at > now() - interval '1 minute') = 0,
  'no account_created event survives any of the refused attempts');

-- =============================================================================
-- the happy path
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cf01'::uuid);

select pg_temp.ok(
  pg_temp.signup(p_nick := 'BrandNew', p_marketing := 'true', p_phone := '''  +420600123456  ''')
    ~ '^[0-9a-f-]{36}$',
  'a valid signup returns the new player id');

reset role;

select pg_temp.ok(
  (select count(*) from public.players p
   where p.auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid
     and p.nickname = 'BrandNew'
     and p.email = 'cs-new@test.invalid'
     and p.country = 'CZ'
     and p.skill_level = 'intermediate'
     and p.marketing_opt_in
     and p.tos_version = 'v1'
     and p.tos_accepted_at is not null) = 1,
  'the row carries email from the session, an upper-cased country, skill and the TOS stamp');

-- Lower case in, upper case stored. The column CHECK would have rejected 'cz',
-- so this proves the function normalises rather than relying on the caller.
select pg_temp.ok(
  (select country from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid) = 'CZ',
  'a lower-case country code is normalised rather than refused');

select pg_temp.ok(
  (select phone from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid) = '+420600123456',
  'a padded phone number is trimmed');

select pg_temp.ok(
  (select count(*) from public.events e
   join public.players p on p.id = e.player_id
   where p.auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid
     and e.event_type = 'account_created'
     and e.metadata->>'country' = 'CZ'
     and e.metadata->>'signup_version' = 'v2') = 1,
  'account_created lands in the same transaction, carrying the profile facts');

-- Idempotence: the second submit returns the same id instead of colliding.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000cf01'::uuid);
select pg_temp.ok(
  pg_temp.signup(p_nick := 'DifferentName') =
    (select id::text from public.players
     where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid),
  'a second call for the same session returns the existing player id');

reset role;

select pg_temp.ok(
  (select count(*) from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid) = 1,
  'the second call created no second row');

select pg_temp.ok(
  (select nickname from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf01'::uuid) = 'BrandNew',
  'the second call did not overwrite the profile with its own arguments');

-- =============================================================================
-- identity is the session's, and there is no argument that changes it
-- =============================================================================

-- A second session signing up cannot land on the first session's row, even
-- using the same nickname the first one used.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000cf02'::uuid);
select pg_temp.ok(pg_temp.signup(p_nick := 'BrandNew') = 'raise:NICKNAME_TAKEN',
  'a different session cannot take an existing nickname');
select pg_temp.ok(
  pg_temp.signup(p_nick := 'SecondPerson') ~ '^[0-9a-f-]{36}$',
  'a different session gets its own row');
reset role;
select pg_temp.ok(
  (select count(distinct auth_user_id) from public.players
   where auth_user_id in ('a0000000-0000-0000-0000-00000000cf01'::uuid,
                          'a0000000-0000-0000-0000-00000000cf02'::uuid)) = 2,
  'the two sessions produced two distinct players');

-- =============================================================================
-- the v1 function is still there, and still works
--
-- Phase 2 §1 forbids a destructive migration without sign-off, so v1 was left
-- in place rather than dropped. That is only true if it is actually still
-- callable — an orphan that was quietly broken would be the worst of both.
-- =============================================================================

select pg_temp.ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'complete_signup'),
  'complete_signup (v1) is still present, awaiting a gated removal');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cf02'::uuid);
select pg_temp.ok_call(
  $q$select public.complete_signup('V1Still', true, false)$q$,
  (select id::text from public.players
   where auth_user_id = 'a0000000-0000-0000-0000-00000000cf02'::uuid),
  'v1 still returns the existing row for a session that already signed up');
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
