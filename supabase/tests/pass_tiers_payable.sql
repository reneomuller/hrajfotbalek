-- =============================================================================
-- EVERY TIER IN THE TABLE CAN ACTUALLY BE BOUGHT
--
-- Run:  node supabase/tests/run.mjs pass_tiers_payable
--
-- Transaction-wrapped and rolled back.
--
-- WHY THIS FILE EXISTS. The 15- and 20-game passes were unbuyable on production
-- and nothing said so: the tiles rendered, the prices were right, and the
-- button answered "Something went wrong. Please try again." `credit_topups`
-- capped `amount_czk` at 2000 and round 35 v2 had priced those two tiers at
-- 2241 and 2772 — so the split was exactly the ceiling, and the three tiers
-- under it went on working, which is what made it look like a code path that
-- could not possibly differ per tier.
--
-- THE SHAPE OF THE BUG IS THE SHAPE OF THE TEST. Every previous pass suite
-- exercised A tier — usually the cheapest, because that is what a fixture
-- reaches for — and a per-tier failure is invisible to any of them. This one
-- drives EVERY ROW IN THE TABLE, and it is written as a loop over `pass_tiers`
-- rather than over a list of five numbers, so a sixth tier added tomorrow is
-- covered on the day it is inserted and not on the day somebody remembers.
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000f7a01'::uuid, 'pt-a@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('6f7a0000-0000-0000-0000-0000000f7a01'::uuid, 'PassBuyer', 'pt-a@test.invalid',
   '60000000-0000-0000-0000-0000000f7a01'::uuid);

-- =============================================================================
-- EVERY TIER, THROUGH THE FUNCTION THE BUTTON CALLS
--
-- `begin_pass_purchase` is what `buyPassAction` calls and what refused. Driving
-- it — rather than inserting a `credit_topups` row directly — is the difference
-- between testing the constraint and testing the PURCHASE, and the bug lived in
-- a guard inside the function as well as in the constraint.
-- =============================================================================

do $$
declare
  t         public.pass_tiers;
  v_row     public.credit_topups;
  v_failed  text := '';
  v_n       int := 0;
begin
  for t in select * from public.pass_tiers order by games loop
    v_n := v_n + 1;
    perform pg_temp.act_as('60000000-0000-0000-0000-0000000f7a01'::uuid);
    begin
      v_row := public.begin_pass_purchase(t.games);

      perform pg_temp.ok(
        v_row.amount_czk = t.price_czk,
        format('the %s-game pass is charged its own price', t.games),
        format('charged %s, tier says %s', v_row.amount_czk, t.price_czk));

      perform pg_temp.ok(
        v_row.pass_games = t.games,
        format('the %s-game pass records its tier', t.games),
        coalesce(v_row.pass_games::text, 'null'));

      perform pg_temp.ok(
        v_row.status = 'pending',
        format('the %s-game pass starts pending', t.games),
        v_row.status::text);
    exception when others then
      -- NAMED, NOT COUNTED. "one tier failed" sends the next reader back to the
      -- database to find out which; this prints the tier and the error it gave.
      v_failed := v_failed || format('%s games -> %s; ', t.games, sqlerrm);
      perform pg_temp.ok(false,
        format('the %s-game pass can be bought at all', t.games), sqlerrm);
    end;
    perform set_config('role', 'postgres', true);
  end loop;

  perform pg_temp.ok(v_n >= 5, 'the tier table is populated', v_n::text);
  perform pg_temp.ok(v_failed = '', 'EVERY TIER IS BUYABLE', v_failed);
end $$;

reset role;

-- =============================================================================
-- AND THE CEILING STILL GUARDS THE PATH IT WAS WRITTEN FOR
--
-- The fix widened the constraint for TIER rows only. A hand-entered amount is
-- still bounded, and asserting that here is what stops a later round from
-- "fixing" a future tier problem by removing the bound outright.
-- =============================================================================

create function pg_temp.manual(p_amount integer)
returns text language plpgsql as $$
begin
  perform pg_temp.act_as('60000000-0000-0000-0000-0000000f7a01'::uuid);
  perform public.create_topup(p_amount);
  perform set_config('role', 'postgres', true);
  return 'accepted';
exception when others then
  perform set_config('role', 'postgres', true);
  return sqlerrm;
end $$;

select pg_temp.ok(pg_temp.manual(public.manual_topup_min_czk()) = 'accepted',
  'a hand-entered top-up at the floor is accepted');
select pg_temp.ok(pg_temp.manual(public.manual_topup_max_czk()) = 'accepted',
  'a hand-entered top-up at the ceiling is accepted');
select pg_temp.ok(pg_temp.manual(public.manual_topup_min_czk() - 1) = 'AMOUNT_OUT_OF_RANGE',
  'a hand-entered top-up below the floor is refused by name');
select pg_temp.ok(pg_temp.manual(public.manual_topup_max_czk() + 1) = 'AMOUNT_OUT_OF_RANGE',
  'A HAND-ENTERED TOP-UP OVER THE CEILING IS STILL REFUSED — the ceiling moved '
  'paths, it did not disappear');

-- =============================================================================
-- THE BOUND IS WRITTEN DOWN ONCE
--
-- Three copies of "2000" — the constraint, `create_topup` and
-- `create_pass_topup` — are how this got out of step in the first place.
-- =============================================================================

/*
 * COMMENTS ARE NOT CODE, and the historical note is worth keeping. Both
 * functions carry a struck-through record of what the bound used to be, which
 * is how this codebase documents a reversal — and which would make a naive
 * search for "2000" fail forever. The lines are stripped before the search, the
 * same fix `scripts/token-sweep.check.ts` needed in round 37 for the same
 * reason.
 */
create function pg_temp.code_only(p_src text)
returns text language sql immutable as $$
  select string_agg(line, chr(10))
    from unnest(string_to_array(p_src, chr(10))) as line
   where btrim(line) not like '--%'
$$;

select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_topup', 'create_pass_topup')
      and pg_temp.code_only(p.prosrc) like '%2000%') = 0,
  'NEITHER TOP-UP WRITER SPELLS THE CEILING AS A LITERAL — comments excluded',
  coalesce((select string_agg(p.proname, ', ') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_topup', 'create_pass_topup')
      and pg_temp.code_only(p.prosrc) like '%2000%'), 'none'));

select pg_temp.ok(
  pg_get_constraintdef(oid) like '%manual_topup_%',
  'and the constraint reads the same function the writers do',
  pg_get_constraintdef(oid))
from pg_constraint where conname = 'credit_topups_amount_range';

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
