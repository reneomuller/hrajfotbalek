-- =============================================================================
-- ROUND 28, ITEM 5b — the ledger's memo and the wallet's floor, drilled.
--
-- Run:  node supabase/tests/run.mjs credit_ledger_note
--
-- MOVED OUT OF THE MIGRATION (2026-09-12). Its drill called `grant_credit`
-- three times for real — +500, -200, +10 — which on a committing apply moves
-- 310 CZK into a live wallet and writes real ledger rows. Money in a migration
-- is the thing this repo least wants; the migration now asserts SHAPE only.
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
  ('a0000000-0000-0000-0000-0000000c1e01', 'cl1@test.invalid'),
  ('a0000000-0000-0000-0000-0000000c1e02', 'cl2@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-0000000c1e01', 'LedgerAdmin', 'cl1@test.invalid',
   'a0000000-0000-0000-0000-0000000c1e01', true),
  ('aaaa0000-0000-0000-0000-0000000c1e02', 'LedgerPlayer', 'cl2@test.invalid',
   'a0000000-0000-0000-0000-0000000c1e02', false);

create function pg_temp.balance() returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger
   where player_id = 'aaaa0000-0000-0000-0000-0000000c1e02';
$$;

create function pg_temp.note_for(p_delta integer, p_reason public.credit_reason)
returns text language sql security definer as $$
  /*
   * KEYED ON THE AMOUNT, NOT ON `created_at`. Every row written inside this
   * suite shares one transaction, and `now()` is TRANSACTION time — so
   * `order by created_at desc limit 1` picks an arbitrary row. The first
   * version of this drill failed on exactly that and blamed the function.
   */
  select l.note from public.credit_ledger l
   where l.player_id = 'aaaa0000-0000-0000-0000-0000000c1e02'
     and l.delta_czk = p_delta and l.reason = p_reason
   limit 1;
$$;

-- =============================================================================
-- authorization — an ordinary player may not move their own wallet
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e02');
select pg_temp.ok_probe(
  $q$select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', 500, 'admin_grant', false, 'mine now')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot grant themselves credit');
reset role;

-- =============================================================================
-- a grant carries its memo, trimmed
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', 500, 'admin_grant', false, '  round 28 probe  ');
reset role;

select pg_temp.ok(
  pg_temp.balance() = 500,
  'the grant landed', pg_temp.balance()::text);

select pg_temp.ok(
  pg_temp.note_for(500, 'admin_grant') = 'round 28 probe',
  'the memo travels with the money, trimmed',
  coalesce(pg_temp.note_for(500, 'admin_grant'), '<null>'));

-- =============================================================================
-- a removal is the same call with the sign flipped
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', -200, 'adjustment', false, 'took some back');
reset role;

select pg_temp.ok(
  pg_temp.balance() = 300,
  'a negative delta removes credit', pg_temp.balance()::text);

select pg_temp.ok(
  pg_temp.note_for(-200, 'adjustment') = 'took some back',
  'a removal carries its memo too');

-- =============================================================================
-- THE FLOOR — a wallet may never go into debt
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select pg_temp.ok_probe(
  $q$select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', -100000, 'adjustment', false, 'too much')$q$,
  'raise:CREDIT_NEGATIVE_BLOCKED',
  'the floor refuses a removal larger than the balance');
reset role;

select pg_temp.ok(
  pg_temp.balance() = 300,
  'the refused removal left the balance alone');

-- =============================================================================
-- a blank memo is NULL, so "has a note" is one test rather than two
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', 10, 'admin_grant', false, '   ');
reset role;

select pg_temp.ok(
  pg_temp.note_for(10, 'admin_grant') is null,
  'a whitespace-only memo is stored as NULL, not as an empty string');

-- =============================================================================
-- ROUND 31, ITEM 3 — the admin's UNIT is credits; the ledger's is crowns
--
-- The conversion lives in `lib/admin/credits.ts` and is unit-tested there.
-- What is asserted HERE is the half SQL owns: the ledger stores the converted
-- CROWNS and nothing about the ruling leaked into the database. `credit_ledger`
-- predates the credits ruling, it is append-only, and every refund rule and
-- every booking's `credit_applied_czk` is denominated in crowns — so this is
-- the assertion that it STAYED that way while the forms changed above it.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', 300, 'admin_grant', false, 'two credits');
reset role;

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where player_id = 'aaaa0000-0000-0000-0000-0000000c1e02'
      and delta_czk = 300 and reason = 'admin_grant') = 1,
  'two credits land as +300 CZK in the ledger');

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', -150, 'adjustment', false, 'one credit back');
reset role;

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where player_id = 'aaaa0000-0000-0000-0000-0000000c1e02'
      and delta_czk = -150 and reason = 'adjustment') = 1,
  'removing one credit lands as -150 CZK');

select pg_temp.ok(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'credit_ledger'
      and column_name = 'delta_czk') = 'integer',
  'the ledger is still denominated in whole crowns — the ruling did not reach it');

-- =============================================================================
-- `redemption` stays the booking rail's — an admin may not hand-write a spend
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000c1e01');
select pg_temp.ok_probe(
  $q$select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', -10, 'redemption', false, 'by hand')$q$,
  'raise:INVALID_CREDIT_REASON',
  'redemption rows are written by create_booking, not by hand');

select pg_temp.ok_probe(
  $q$select public.grant_credit('aaaa0000-0000-0000-0000-0000000c1e02', 0, 'admin_grant', false, 'nothing')$q$,
  'raise:INVALID_CREDIT_DELTA',
  'a zero movement is refused rather than written');
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
