-- =============================================================================
-- Phase 8 assertions — auth RPCs (link-sent, completed, shadow claim, signup)
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/auth_rpcs.sql
--
-- Transaction-wrapped and rolled back.
--
-- lib/auth/__tests__/shadowClaim.test.ts covers the DECISION RULE exhaustively
-- as a pure function. This file covers the authoritative implementation, which
-- is the one that actually runs: claim_shadow_player() is SECURITY DEFINER
-- because `players` is RLS-bound to the caller's own row, so a session cannot
-- even see a shadow row that is not yet theirs. Those are different things and
-- both need proving.
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

create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  execute 'with _p as (' || sql || ') select count(*) from _p' into n;
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

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- Clears the JWT claims as well as the role.
--
-- `reset role` alone is NOT enough: request.jwt.claims is a separate GUC and
-- survives it, so auth.uid() keeps resolving to whoever act_as() last set.
-- Any assertion that means "nobody is signed in" must clear the claims too, or
-- it silently tests a logged-in session instead. This bit one of the
-- assertions below before it was added.
create function pg_temp.act_as_nobody()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.ev_count(p_type text)
returns integer language sql security definer as $$
  select count(*)::int from public.events e where e.event_type = p_type;
$$;

-- Counts only THIS FILE'S players: the four fixture rows, plus any row created
-- by a signup under one of this file's auth users. A global count(*) passed
-- only against an empty database and broke as soon as `npm run seed` existed.
create function pg_temp.player_count()
returns integer language sql security definer as $$
  select count(*)::int from public.players p
   where p.id in (
           'aaaa0000-0000-0000-0000-00000000000a',
           'bbbb0000-0000-0000-0000-00000000000b',
           'cccc0000-0000-0000-0000-00000000000c',
           'dddd0000-0000-0000-0000-00000000000d')
      or p.auth_user_id in (
           'a0000000-0000-0000-0000-0000000000a1',
           'b0000000-0000-0000-0000-0000000000b1',
           'c0000000-0000-0000-0000-0000000000c1',
           'd0000000-0000-0000-0000-0000000000d1',
           'e0000000-0000-0000-0000-0000000000e1',
           'f0000000-0000-0000-0000-0000000000f1');
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  -- Matches a shadow exactly.
  ('a0000000-0000-0000-0000-0000000000a1', 'shadow@test.invalid'),
  -- Matches a shadow but with different casing.
  ('b0000000-0000-0000-0000-0000000000b1', 'MIXED@Test.Invalid'),
  -- Matches nothing.
  ('c0000000-0000-0000-0000-0000000000c1', 'brandnew@test.invalid'),
  -- Same address as an email-less shadow's owner would have been.
  ('d0000000-0000-0000-0000-0000000000d1', 'noemail@test.invalid'),
  -- Address belongs to a player already bound to another account.
  ('e0000000-0000-0000-0000-0000000000e1', 'taken@test.invalid'),
  ('f0000000-0000-0000-0000-0000000000f1', 'signup@test.invalid'),
  -- The account that already owns the 'taken@test.invalid' player row. Must
  -- exist before that row is inserted — players_auth_user_id_fkey.
  ('00000000-0000-0000-0000-0000000000ff', 'owner@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'ShadowOne', 'shadow@test.invalid', null),
  ('bbbb0000-0000-0000-0000-00000000000b', 'ShadowMix', 'mixed@test.invalid',  null),
  -- Email-less shadow: never auto-claimable by anyone.
  ('cccc0000-0000-0000-0000-00000000000c', 'ShadowNone', null,                 null),
  -- Already bound to a DIFFERENT account.
  ('dddd0000-0000-0000-0000-00000000000d', 'AlreadyMine', 'taken@test.invalid',
   '00000000-0000-0000-0000-0000000000ff');

-- =============================================================================
-- claim_shadow_player
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  (select public.claim_shadow_player()) = 'aaaa0000-0000-0000-0000-00000000000a',
  'an exact email match claims the existing shadow row');
reset role;

select pg_temp.ok(
  (select auth_user_id from public.players
    where id = 'aaaa0000-0000-0000-0000-00000000000a')
    = 'a0000000-0000-0000-0000-0000000000a1',
  'the shadow row is bound to the session''s auth user');

select pg_temp.ok(
  pg_temp.ev_count('player_claimed') = 1,
  'player_claimed is emitted exactly once');

select pg_temp.ok(
  pg_temp.player_count() = 4,
  'no duplicate players row was created by the claim',
  'players=' || pg_temp.player_count());

-- Case-insensitive, consistent with the lower(email) unique index.
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(
  (select public.claim_shadow_player()) = 'bbbb0000-0000-0000-0000-00000000000b',
  'the match is case-insensitive (MIXED@Test.Invalid -> mixed@test.invalid)');
reset role;

-- Idempotent: calling again returns the same row, claims nothing new.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  (select public.claim_shadow_player()) = 'aaaa0000-0000-0000-0000-00000000000a',
  'a second call returns the already-linked row rather than re-claiming');
reset role;

select pg_temp.ok(
  pg_temp.ev_count('player_claimed') = 2,
  'the repeat call emits no additional player_claimed event',
  'player_claimed=' || pg_temp.ev_count('player_claimed'));

-- Email-less shadow is never auto-claimed.
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(
  (select public.claim_shadow_player()) is null,
  'an email-less shadow is NEVER auto-claimed (admin merge only)');
reset role;

select pg_temp.ok(
  (select auth_user_id from public.players
    where id = 'cccc0000-0000-0000-0000-00000000000c') is null,
  'the email-less shadow remains unbound');

-- A row already owned by another account is never re-bound.
select pg_temp.act_as('e0000000-0000-0000-0000-0000000000e1');
select pg_temp.ok(
  (select public.claim_shadow_player()) is null,
  'a player row bound to another account is never re-bound');
reset role;

select pg_temp.ok(
  (select auth_user_id from public.players
    where id = 'dddd0000-0000-0000-0000-00000000000d')
    = '00000000-0000-0000-0000-0000000000ff',
  'that row still belongs to its original account');

-- No match at all.
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(
  (select public.claim_shadow_player()) is null,
  'an unmatched email claims nothing (caller routes to signup)');
reset role;

-- =============================================================================
-- record_auth_completed
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  (select public.record_auth_completed()) = true,
  'record_auth_completed reports true when a player row exists');
reset role;

select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(
  (select public.record_auth_completed()) = false,
  'and false for a session with no player row yet');
reset role;

select pg_temp.ok(
  pg_temp.ev_count('auth_completed') = 2,
  'auth_completed is written on each completion',
  'auth_completed=' || pg_temp.ev_count('auth_completed'));

-- =============================================================================
-- record_auth_link_sent — the funnel numerator, callable by anon
-- =============================================================================

set local role anon;
select pg_temp.ok_probe(
  $q$select public.record_auth_link_sent(null, 'login')$q$,
  'rows:1',
  'anon CAN record auth_link_sent (they have not signed in yet — that is the point)');

select pg_temp.ok_probe(
  $q$select public.record_auth_link_sent(null, 'nonsense')$q$,
  'raise:INVALID_PENDING_ACTION',
  'an unknown pending action is rejected');
reset role;

select pg_temp.ok(
  pg_temp.ev_count('auth_link_sent') = 1,
  'exactly one auth_link_sent row was written');

-- Even though anon may write this event, it still cannot read the log back.
set local role anon;
select pg_temp.ok_probe(
  $q$select * from public.events$q$,
  'denied',
  'anon still cannot read events despite being able to append one type');
reset role;

-- =============================================================================
-- complete_signup
-- =============================================================================

select pg_temp.act_as('f0000000-0000-0000-0000-0000000000f1');

select pg_temp.ok_probe(
  $q$select public.complete_signup('bad*name!', true, false)$q$,
  'raise:NICKNAME_INVALID',
  'signup with nickname "bad*name!" raises NICKNAME_INVALID');

select pg_temp.ok_probe(
  $q$select public.complete_signup('ShadowOne', true, false)$q$,
  'raise:NICKNAME_TAKEN',
  'signup with an existing nickname raises a DISTINCT NICKNAME_TAKEN');

select pg_temp.ok_probe(
  $q$select public.complete_signup('shadowone', true, false)$q$,
  'raise:NICKNAME_TAKEN',
  'nickname uniqueness is case-insensitive');

select pg_temp.ok_probe(
  $q$select public.complete_signup('FreshName', false, false)$q$,
  'raise:CONSENT_REQUIRED',
  'signup without GDPR consent is blocked');

select pg_temp.ok_probe(
  $q$select public.complete_signup('FreshName', null, false)$q$,
  'raise:CONSENT_REQUIRED',
  'a null consent value is treated as absent, not as true');
reset role;

select pg_temp.ok(
  pg_temp.player_count() = 4,
  'none of the rejected signups created a players row',
  'players=' || pg_temp.player_count());

-- The happy path, with marketing opt-in independent of consent.
select pg_temp.act_as('f0000000-0000-0000-0000-0000000000f1');
select pg_temp.ok(
  (select public.complete_signup('FreshName', true, true)) is not null,
  'a valid signup with consent creates the player');
reset role;

select pg_temp.ok(
  (select marketing_opt_in from public.players where nickname = 'FreshName') = true,
  'marketing_opt_in is persisted independently of GDPR consent');

select pg_temp.ok(
  (select email from public.players where nickname = 'FreshName') = 'signup@test.invalid',
  'the new player carries the session email');

select pg_temp.ok(
  pg_temp.ev_count('account_created') = 1,
  'account_created is emitted on first-time signup');

-- =============================================================================
-- authorization
-- =============================================================================

set local role anon;
select pg_temp.ok_probe($q$select public.record_auth_completed()$q$, 'denied',
  'anon cannot call record_auth_completed');
select pg_temp.ok_probe($q$select public.claim_shadow_player()$q$, 'denied',
  'anon cannot call claim_shadow_player');
select pg_temp.ok_probe($q$select public.complete_signup('X', true, false)$q$, 'denied',
  'anon cannot call complete_signup');
reset role;

-- An `authenticated` role with no JWT subject is not a session.
select pg_temp.act_as_nobody();
set local role authenticated;
select pg_temp.ok_probe($q$select public.claim_shadow_player()$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'the authenticated role without a JWT subject is refused');

select pg_temp.ok_probe($q$select public.record_auth_completed()$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'record_auth_completed likewise requires a subject, not just the role');

select pg_temp.ok_probe($q$select public.complete_signup('NoSession', true, false)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'complete_signup likewise requires a subject');
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
