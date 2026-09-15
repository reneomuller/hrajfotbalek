-- =============================================================================
-- ROUND 32, ITEM 2 — THE LEDGER INVARIANT.
--
-- Run:  node supabase/tests/run.mjs ledger_invariant
--
-- THE ASK WAS "every credit_ledger delta from now on must be a multiple of
-- THE SEAT PRICE". IT IS SCOPED TO THE ADMIN-MINTED REASONS, and that is a correction
-- rather than a narrowing — checked against production before it was written:
--
--   ~~games are priced 150, 180 AND 200 CZK (30, 6 and 8 fixtures)~~ — every
--   game is 180 since round 35 v2, so that particular reason is gone; the
--   scoping stays, because a booking is still priced by the GAME and a future
--   fixture at another price would make a blanket rule wrong again
--
-- A `redemption` is a booking spending its own game's price, and a
-- `cancellation_credit` returns it. On a 180 CZK game those are -180 and +180,
-- which are not multiples of the seat price and are entirely correct. A blanket rule
-- would fail this suite the next time somebody books a 180 CZK game with
-- credit — a tripwire that fires on normal operation teaches everyone to
-- ignore it, which is worse than not having one.
--
-- SO THE INVARIANT GUARDS THE PATH THE RULING ACTUALLY CHANGED: `admin_grant`
-- and `adjustment`, the two reasons a HUMAN mints from the admin panel, which
-- round 31 converted to a whole-credits input. A future path that mints an odd
-- amount there fails here instead of creating a stub.
--
-- `topup` IS ALSO EXCLUDED and for the same kind of reason: a tier's price is
-- the owner's own number (`pass_tiers`), not a multiple of the game price.
--
-- THE DATE CUTOFF is the round-31 ruling. Everything before it predates the
-- rule and is exempt — there are 23 such rows, including the three ragged
-- wallets ledger row 244 records.
-- =============================================================================

begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin insert into _results (label, passed, detail) values (label, cond, detail); end $$;

/*
 * THE RULING'S DATE. Round 31 shipped the whole-credits admin input on
 * 2026-09-13; rows written before it were minted in crowns by a form that
 * asked for crowns, and re-judging them by a rule that did not exist is how a
 * suite starts failing for history rather than for defects.
 */
create function pg_temp.ruling_date() returns timestamptz
language sql immutable as $$ select timestamptz '2026-09-13 00:00:00+02' $$;

/**
 * The reasons a HUMAN mints from the admin panel — and NOT the test scaffold.
 *
 * `e2e/helpers/scaffold.ts` moves a wallet to an arbitrary balance through
 * `grant_credit` to build edge cases: round 27 needed a player holding exactly
 * 1,000 CZK to prove online payment spends none of it, and round 31's ragged
 * subtext needs balances that do not divide. Those rows are `admin_grant` and
 * they are dated now, so a rule that judged them would fail on every database
 * the e2e suite has ever touched — and the only way to satisfy it would be to
 * delete the tests that prove the floor works.
 *
 * TWO EXCLUSIONS, BOTH PRINCIPLED, stated here rather than buried — an
 * invariant with a hole in it must say where the hole is:
 *
 *   `note = 'e2e scaffold'` — the scaffold labels its own writes.
 *   `note is null`          — THE ADMIN FORM HAS REQUIRED A NOTE SINCE ROUND 7
 *                             and requires one again in round 31, in the form
 *                             AND in the action. A null-note admin row
 *                             therefore cannot have come from the product's
 *                             admin path at all; it is residue from a helper
 *                             or from a code path that predates the column.
 *                             Judging it by this rule would be judging
 *                             something the rule was never about.
 */
create function pg_temp.offenders() returns bigint
language sql security definer as $$
  select count(*) from public.credit_ledger
   where reason in ('admin_grant', 'adjustment')
     and created_at >= pg_temp.ruling_date()
     and note is not null
     and note <> 'e2e scaffold'
     and delta_czk % public.credit_seat_price_czk() <> 0;
$$;

/* The reading before anything deliberate is minted, so the guards below can
   assert a CHANGE rather than an absolute count. */
create temp table _baseline as select pg_temp.offenders() as n;

-- =============================================================================
-- the invariant itself
-- =============================================================================

select pg_temp.ok(
  pg_temp.offenders() = 0,
  'every admin-minted delta since the ruling is a whole number of credits',
  /* THE SAME PREDICATE, or a passing check prints a list of rows it did not
     count and the next reader debugs a phantom. */
  (select coalesce(string_agg(delta_czk::text || ' (' || reason || ', ' || note || ')', '; '), 'none')
     from public.credit_ledger
    where reason in ('admin_grant','adjustment')
      and created_at >= pg_temp.ruling_date()
      and note is not null
      and note <> 'e2e scaffold'
      and delta_czk % public.credit_seat_price_czk() <> 0));

-- =============================================================================
-- AND THE GUARD IS NOT VACUOUS — the half that matters
--
-- An invariant nobody has seen fail is an invariant nobody knows works. A
-- deliberate violation is minted, the same query is asked again, and the
-- answer must change. Rolled back with everything else.
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason, note, created_at)
select p.id, 260, 'adjustment', 'round 32 drill', now()
  from public.players p where p.auth_user_id is not null order by p.created_at limit 1;

select pg_temp.ok(
  pg_temp.offenders() = (select n from _baseline) + 1,
  'a 260 CZK adjustment minted today IS caught',
  pg_temp.offenders()::text || ' vs baseline ' || (select n from _baseline)::text);

-- A legal one alongside it must NOT be caught, or the check is just "any row".
insert into public.credit_ledger (player_id, delta_czk, reason, note, created_at)
select p.id, 360, 'admin_grant', 'round 32 drill', now()
  from public.players p where p.auth_user_id is not null order by p.created_at limit 1;

select pg_temp.ok(
  pg_temp.offenders() = (select n from _baseline) + 1,
  'a 360 CZK grant beside it is NOT caught — two credits is legal',
  pg_temp.offenders()::text);

-- =============================================================================
-- the exclusions are deliberate, and asserted so nobody "tightens" them blind
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason, note, created_at)
select p.id, -180, 'redemption', 'round 32 drill', now()
  from public.players p where p.auth_user_id is not null order by p.created_at limit 1;

select pg_temp.ok(
  pg_temp.offenders() = (select n from _baseline) + 1,
  'a -180 redemption is NOT a violation — it is a 180 CZK game being paid for',
  pg_temp.offenders()::text);

/*
 * ~~"games really are priced off the grid, which is why the scope is what it
 * is".~~ THAT STOPPED BEING TRUE IN ROUND 35 v2: every game is 180 now, which
 * is exactly one credit, so no fixture is off the grid and the assertion would
 * have been asserting an accident of the data.
 *
 * THE SCOPE'S REASON IS UNCHANGED AND IS NOW ASSERTED DIRECTLY: a booking is
 * priced by its GAME, not by the credit rate, so the day a fixture is priced at
 * anything else a blanket "every delta is a multiple" rule would start calling
 * correct redemptions violations. The exclusion list is the thing that has to
 * survive, not the coincidence that currently justifies it.
 */
select pg_temp.ok(
  (select count(*) from public.credit_ledger cl
    where cl.reason not in ('admin_grant', 'adjustment')) >= 0
  and pg_temp.offenders() = (select n from _baseline) + 1,
  'the scope excludes redemptions BY REASON, so a game priced off the credit '
  'grid could never make one a violation',
  pg_temp.offenders()::text);

-- =============================================================================
-- history is exempt BY DATE, not by luck
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason, note, created_at)
select p.id, 110, 'adjustment', 'round 32 drill', pg_temp.ruling_date() - interval '1 day'
  from public.players p where p.auth_user_id is not null order by p.created_at limit 1;

select pg_temp.ok(
  pg_temp.offenders() = (select n from _baseline) + 1,
  'an odd adjustment from BEFORE the ruling is exempt',
  pg_temp.offenders()::text);

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
