-- =============================================================================
-- Migration 21 assertions — player profile columns + skill_level, and the
--                            `topup` credit reason from migration 22
--
-- Run:  node supabase/tests/run.mjs player_profile_columns
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
-- `call()` consumes the value it selects (POLISH.md), so a privilege check
-- cannot pass by having its function call pruned out of the plan.
--
-- WHAT THIS SUITE IS FOR. The columns are additive and nullable, so "does the
-- migration apply" is not the interesting question — `db reset` answers that.
-- The interesting questions are the two that a migration can get wrong
-- silently:
--
--   1. Can a player WRITE these columns directly? They must not. `players`
--      grants UPDATE per column (nickname, phone, marketing_opt_in) precisely
--      because RLS cannot restrict columns, and a table-wide grant added by
--      habit would let a player edit their own consent evidence.
--   2. Do the CHECKs actually reject the values they exist to reject? A shape
--      constraint on a column that reaches an <img src> is only worth what its
--      rejections are worth.
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

-- A statement that returns nothing still has to be observed. `do_stmt` runs it
-- and reports how it ended, so an UPDATE that is silently a no-op is
-- distinguishable from one that was refused.
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
  ('a0000000-0000-0000-0000-0000000ef001'::uuid, 'pf-one@test.invalid'),
  ('a0000000-0000-0000-0000-0000000ef002'::uuid, 'pf-two@test.invalid');

insert into public.players
  (id, nickname, email, auth_user_id, country, skill_level, tos_accepted_at, tos_version) values
  ('bbbb0000-0000-0000-0000-0000000ef001'::uuid, 'PfOne', 'pf-one@test.invalid',
   'a0000000-0000-0000-0000-0000000ef001'::uuid, 'CZ', 'intermediate', now(), 'v1'),
  ('bbbb0000-0000-0000-0000-0000000ef002'::uuid, 'PfTwo', 'pf-two@test.invalid',
   'a0000000-0000-0000-0000-0000000ef002'::uuid, null, null, null, null);

-- =============================================================================
-- the columns exist, and nullable means nullable
-- =============================================================================

select pg_temp.ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'players'
     and column_name in ('country','skill_level','tos_accepted_at','tos_version','photo_path')
     and is_nullable = 'YES') = 5,
  'all five profile columns exist and are nullable');

-- The four players who predate Phase 2 must survive the migration untouched.
-- A default would have been the easy mistake: it would assert a nationality and
-- a skill level for people who never supplied either.
select pg_temp.ok(
  (select count(*) from public.players
   where id = 'bbbb0000-0000-0000-0000-0000000ef002'::uuid
     and country is null and skill_level is null
     and tos_accepted_at is null and photo_path is null) = 1,
  'a player with no profile data keeps nulls rather than gaining defaults');

-- =============================================================================
-- reads: own row only, new columns included
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ef001'::uuid);

select pg_temp.ok_call(
  $q$select country from public.players where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'CZ',
  'a player reads their own country');

select pg_temp.ok_call(
  $q$select skill_level from public.players where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'intermediate',
  'a player reads their own skill level');

-- RLS is unchanged by this migration, and the new columns must not become a
-- hole in it.
select pg_temp.ok_call(
  $q$select count(_p::text) from (select country from public.players
     where id = 'bbbb0000-0000-0000-0000-0000000ef002'::uuid) _p$q$,
  '0',
  'a player cannot read another player''s country');

reset role;

-- =============================================================================
-- writes: the new columns are not client-writable
--
-- This is the assertion the migration exists to keep true. Each column is
-- attempted individually, because a single combined UPDATE would pass the test
-- as soon as ANY one of them was refused.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000ef001'::uuid);

select pg_temp.ok_do(
  $q$update public.players set country = 'SK'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'denied',
  'a player cannot write their own country directly');

select pg_temp.ok_do(
  $q$update public.players set skill_level = 'advanced'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'denied',
  'a player cannot promote their own skill level directly');

-- Consent evidence. A player editing when they accepted the terms is not a
-- feature, and it is the reason tos_* is not in the UPDATE grant.
select pg_temp.ok_do(
  $q$update public.players set tos_accepted_at = now()
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'denied',
  'a player cannot write their own TOS timestamp');

select pg_temp.ok_do(
  $q$update public.players set tos_version = 'v99'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'denied',
  'a player cannot write their own TOS version');

select pg_temp.ok_do(
  $q$update public.players set photo_path = 'players/00000000-0000-0000-0000-000000000000.jpg'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'denied',
  'a player cannot write their own photo path directly');

-- The three columns that WERE writable before this migration still are. A
-- migration that quietly narrowed them would be just as wrong.
select pg_temp.ok_do(
  $q$update public.players set phone = '+420600000999'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'ok',
  'the pre-existing per-column UPDATE grant still works');

reset role;

-- =============================================================================
-- the CHECK constraints reject what they are for
-- =============================================================================

select pg_temp.ok_do(
  $q$update public.players set country = 'cz'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'a lower-case country code is rejected');

select pg_temp.ok_do(
  $q$update public.players set country = 'CZE'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'a three-letter country code is rejected');

-- The photo path reaches an <img src>. Constrain the value where it is stored,
-- not where it is displayed — the same reasoning as venues.image_path.
select pg_temp.ok_do(
  $q$update public.players set photo_path = 'https://evil.example.com/x.jpg'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'an off-site photo URL is rejected');

select pg_temp.ok_do(
  $q$update public.players set photo_path = 'javascript:alert(1)'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'a javascript: photo path is rejected');

select pg_temp.ok_do(
  $q$update public.players set photo_path = 'players/../../etc/passwd.jpg'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'a traversal photo path is rejected');

select pg_temp.ok_do(
  $q$update public.players set photo_path = 'players/00000000-0000-0000-0000-000000000000.svg'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'check_violation',
  'an SVG photo path is rejected (it is a script container, not an image)');

select pg_temp.ok_do(
  $q$update public.players set photo_path = 'players/00000000-0000-0000-0000-000000000000.webp'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'ok',
  'a well-formed photo path is accepted');

-- A timestamp without a version cannot be audited; a version without a
-- timestamp is not consent.
select pg_temp.ok_do(
  $q$update public.players set tos_accepted_at = now(), tos_version = null
     where id = 'bbbb0000-0000-0000-0000-0000000ef002'::uuid$q$,
  'check_violation',
  'a TOS timestamp without a version is rejected');

select pg_temp.ok_do(
  $q$update public.players set tos_accepted_at = null, tos_version = 'v1'
     where id = 'bbbb0000-0000-0000-0000-0000000ef002'::uuid$q$,
  'check_violation',
  'a TOS version without a timestamp is rejected');

-- =============================================================================
-- the enums
-- =============================================================================

select pg_temp.ok(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'skill_level') = array['beginner','intermediate','advanced'],
  'skill_level carries exactly the three contract levels, in order');

select pg_temp.ok_do(
  $q$update public.players set skill_level = 'expert'
     where id = 'bbbb0000-0000-0000-0000-0000000ef001'::uuid$q$,
  'error:22P02',
  'a skill level outside the enum is rejected by the type');

-- Migration 22. Asserted here rather than in its own suite because a one-line
-- enum addition has no behaviour of its own to test — what matters is that the
-- label exists before the top-up RPCs reference it.
select pg_temp.ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'credit_reason' and e.enumlabel = 'topup'),
  'credit_reason carries topup, ready for the top-up RPCs');

-- SIX SINCE PHASE 20a, and the edit is deliberate. Migration 31 added
-- `pass_expiry` for the rows the expiry sweep writes — distinct from
-- `adjustment` because filing an expiry there would make it indistinguishable
-- from an admin fixing a mistake, on the one ledger row a player is most
-- likely to ask about.
--
-- The assertion stays EXHAUSTIVE rather than becoming `>= 5`. Its job is that
-- a label cannot appear or disappear without someone editing this line on
-- purpose: `credit_reason` is the vocabulary of the money trail, and Postgres
-- cannot drop an enum value, so an accidental addition is permanent.
select pg_temp.ok(
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'credit_reason') = 6,
  'credit_reason carries exactly six labels — nothing appeared or vanished unnoticed');

select pg_temp.ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'credit_reason' and e.enumlabel = 'pass_expiry'),
  'credit_reason carries pass_expiry, ready for the expiry sweep');

-- =============================================================================
-- anon sees nothing here, as before
-- =============================================================================

-- `denied`, not `0`. `players` grants anon nothing at all, so the read is
-- refused on privileges before RLS is ever consulted — a stronger result than
-- an empty row set, and the distinction is worth asserting: an empty result
-- would also be what a table-wide grant plus a working policy looks like, and
-- those are one careless GRANT apart.
set local role anon;
select pg_temp.ok_call(
  $q$select count(_p::text) from (select country, photo_path from public.players) _p$q$,
  'denied',
  'an anonymous caller is denied player profile data outright');
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
