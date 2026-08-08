-- =============================================================================
-- v1.3 conformance B — the ledger, its batches, and the balance invariant
--
-- Run:  node supabase/tests/run.mjs v13_conformance/schema_b
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- THE INVARIANT THIS SUITE EXISTS FOR:
--
--     balance = SUM(delta_czk), with NO expiry predicate, everywhere.
--
-- It is worth a suite because the tempting bug is a *fix*. Expired credit stays
-- spendable until the sweep writes its compensating row, which is a window in
-- which a player can spend money that has notionally expired. The obvious
-- repair is `and expires_at > now()` in the balance query — and it is wrong
-- twice over: it puts an expiry rule in every reader, so they disagree the
-- moment one is missed, and it makes the balance disagree with the ledger that
-- produces it. The window is bounded by the sweep interval and closed by the
-- sweep, never by filtering (SCOPE.md §3, exclusion 9).
--
-- WHAT IS *NOT* A VIOLATION, and why this suite has to be careful. Splitting
-- the ledger into pools is not filtering the balance. `apply_credit` spends
-- batch credit first, soonest expiry first, then the ordinary pool defined as
-- `expires_at is null and batch_id is null` — that predicate exists to avoid
-- double-counting rows already spent in the batch loop, and removing it would
-- be the bug. A probe that merely greps for `expires_at` near `sum(delta_czk)`
-- would flag that correct code and teach the next reader to ignore it.
--
-- So the invariant is asserted BEHAVIOURALLY: write an already-expired credit
-- row and confirm the balance still counts it.
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

create function pg_temp.col(tbl text, col text)
returns text language plpgsql as $$
declare v text;
begin
  select case when is_nullable = 'YES' then 'nullable' else 'not null' end into v
  from information_schema.columns
  where table_schema = 'public' and table_name = tbl and column_name = col;
  return coalesce(v, 'ABSENT');
end $$;

-- The definition text of a named CHECK constraint, or ABSENT.
create function pg_temp.chk(tbl text, name text)
returns text language plpgsql as $$
declare v text;
begin
  select pg_get_constraintdef(con.oid) into v
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = tbl and con.conname = name;
  return coalesce(v, 'ABSENT');
end $$;

create function pg_temp.attempt(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when check_violation then return 'check_violation';
  when insufficient_privilege then return 'denied';
  when others then return 'error:' || sqlstate;
end $$;

-- A player to hang ledger rows on, created inside the transaction.
create temp table _fx (player_id uuid) on commit drop;
insert into _fx
select id from public.players where is_seed limit 1;

-- Negative control, on the same terms as schema_a: prove col() can say ABSENT,
-- so a genuinely missing column fails rather than passing silently.
select pg_temp.ok(
  pg_temp.col('credit_ledger', 'column_that_does_not_exist') = 'ABSENT',
  'negative control: a nonexistent ledger column reports ABSENT');

select pg_temp.ok(
  (select count(*) from _fx) = 1,
  'fixture: a seed player exists to hang ledger rows on');

-- =============================================================================
-- 1. The two v2.5 columns, both nullable
--
-- Nullable is the requirement. Both were added to a table with live rows, and
-- NULL is not "missing data" here — it is the statement that a credit is
-- permanent and belongs to no batch. That is what every pre-existing row means,
-- and a NOT NULL column would have forced a backfill that invented an expiry
-- nobody agreed to.
-- =============================================================================

select pg_temp.ok(pg_temp.col('credit_ledger', 'expires_at') = 'nullable',
  'credit_ledger.expires_at exists and is nullable',
  pg_temp.col('credit_ledger', 'expires_at'));

select pg_temp.ok(pg_temp.col('credit_ledger', 'batch_id') = 'nullable',
  'credit_ledger.batch_id exists and is nullable',
  pg_temp.col('credit_ledger', 'batch_id'));

select pg_temp.ok(pg_temp.col('credit_ledger', 'delta_czk') = 'not null',
  'credit_ledger.delta_czk is not null — every row moves money or does not exist');

-- =============================================================================
-- 2. Every pre-existing row reads as permanent, unbatched credit
--
-- Asserted over rows that predate this transaction. If it ever fails, some
-- migration backfilled an expiry onto historical credit, which is money taken
-- away from players who were never told.
-- =============================================================================

/*
 * Scoped to the two reasons that can NEVER be batch-related.
 *
 * `credit_reason` is (cancellation_credit, admin_grant, redemption,
 * adjustment, topup, pass_expiry). Four of those legitimately carry a batch:
 * `topup` opens one, `redemption` spends from one, `pass_expiry` is the
 * sweep's compensating row against one, and `cancellation_credit` returns a
 * spot's price to the batch it came from. Asserting "every row has both null"
 * would therefore fail the moment anyone buys a pass — it would be asserting
 * that the batch feature does not work.
 *
 * `admin_grant` and `adjustment` are the two that are always plain money:
 * someone decided a player is owed credit, and nothing about that decision
 * expires. If either ever carries an expiry, a migration has backfilled one
 * onto credit that was granted unconditionally — which is money taken away
 * from players who were never told.
 */
select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where reason in ('admin_grant', 'adjustment')
      and (expires_at is not null or batch_id is not null)) = 0,
  'admin_grant and adjustment rows are permanent and unbatched',
  (select 'offending rows: ' || count(*)::text from public.credit_ledger
    where reason in ('admin_grant', 'adjustment')
      and (expires_at is not null or batch_id is not null)));

-- And the ledger is not trivially empty of them, which would make the
-- assertion above pass by having nothing to check.
select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where reason in ('admin_grant', 'adjustment')) > 0,
  'there are such rows to check — the assertion above is not vacuous',
  (select 'count: ' || count(*)::text from public.credit_ledger
    where reason in ('admin_grant', 'adjustment')));

-- =============================================================================
-- 3. THE INVARIANT — an expired row still counts toward the balance
--
-- The behavioural assertion. Write a credit that expired an hour ago and
-- confirm the unfiltered sum includes it. A reader that had "fixed" the
-- transient window with `expires_at > now()` would report the smaller number.
-- =============================================================================

-- Baseline before anything is written.
create temp table _bal (stage text, amount integer) on commit drop;

insert into _bal
select 'before', coalesce(sum(delta_czk), 0)::integer
from public.credit_ledger where player_id = (select player_id from _fx);

/*
 * An ALREADY-EXPIRED batch credit — a batch-OPENING row.
 *
 * The shape matters and is asserted in §3a below: `credit_ledger_batch_shape`
 * is `expires_at IS NULL OR batch_id IS NULL`, so a row carries one or the
 * other and never both. An opening row sets `expires_at` and leaves `batch_id`
 * null, because the batch's identity is that row's own `id`; the rows that
 * spend it point back with `batch_id`. Writing `expires_at` and `batch_id`
 * together is rejected, which is what makes "which row IS the batch"
 * unambiguous.
 */
insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
values ((select player_id from _fx), 500, 'topup', now() - interval '1 hour');

insert into _bal
select 'after_expired_credit', coalesce(sum(delta_czk), 0)::integer
from public.credit_ledger where player_id = (select player_id from _fx);

select pg_temp.ok(
  (select amount from _bal where stage = 'after_expired_credit')
  - (select amount from _bal where stage = 'before') = 500,
  'an EXPIRED credit still counts toward SUM(delta_czk) — no expiry predicate',
  'before=' || (select amount from _bal where stage = 'before')::text
  || ' after=' || (select amount from _bal where stage = 'after_expired_credit')::text);

-- And the same sum computed with the tempting "fix" differs, which is what
-- makes the assertion above meaningful rather than vacuous: if both numbers
-- agreed, the probe would pass on a filtered reader too.
select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger
    where player_id = (select player_id from _fx)
      and (expires_at is null or expires_at > now()))
  <> (select amount from _bal where stage = 'after_expired_credit'),
  'the filtered variant returns a DIFFERENT number — the probe can distinguish them');

-- =============================================================================
-- 3a. The batch shape — one column or the other, never both
--
-- Two CHECKs carry the whole batch model, and they are worth pinning because
-- the model is not obvious from the column names:
--
--   credit_ledger_batch_shape     expires_at IS NULL OR batch_id IS NULL
--   credit_ledger_batch_positive  expires_at IS NULL OR delta_czk > 0
--
-- Together they say: a batch is OPENED by a positive row carrying an expiry
-- and no batch_id — the batch's identity is that row's own id — and every row
-- that consumes it points back with batch_id and carries no expiry of its own.
-- A negative row can never carry an expiry, because you cannot expire a debt.
--
-- Drop the first CHECK and "which row is the batch" becomes ambiguous the
-- first time something writes both.
-- =============================================================================

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.credit_ledger (player_id, delta_czk, reason, expires_at, batch_id)
    values ((select player_id from _fx), 250, 'topup', now() + interval '60 days',
            '2f1efd48-0000-4000-8000-0000000000b1')
  $q$) = 'check_violation',
  'a row carrying BOTH expires_at and batch_id is refused');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
    values ((select player_id from _fx), -250, 'redemption', now() + interval '60 days')
  $q$) = 'check_violation',
  'a NEGATIVE row carrying an expiry is refused — a debt cannot expire');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.credit_ledger (player_id, delta_czk, reason)
    values ((select player_id from _fx), 0, 'adjustment')
  $q$) = 'check_violation',
  'a zero-delta row is refused — every row moves money or does not exist');

-- =============================================================================
-- 4. The pool split in apply_credit is not a balance filter
--
-- Pinned deliberately. `apply_credit` spends batches first and then the
-- ordinary pool, `expires_at is null and batch_id is null`. That predicate is
-- correct — it prevents double-spending rows the batch loop already consumed —
-- and someone reading §3 above could "fix" it into a bug.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'apply_credit' and prosrc ~ 'batch_id is null') = 1,
  'apply_credit splits the ordinary pool by batch_id — not a balance filter');

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'create_booking_internal' and prosrc ~* 'expires_at') = 0,
  'create_booking_internal computes balance with NO expiry predicate');

-- =============================================================================
-- 5. The ledger is append-only for every client role
--
-- RLS governs which rows a player reads. It cannot make a table append-only —
-- that is a grant. An UPDATE privilege here would let a player rewrite the
-- history that produces their own balance.
-- =============================================================================

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.credit_ledger', 'UPDATE'),
  'authenticated cannot UPDATE credit_ledger');

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.credit_ledger', 'DELETE'),
  'authenticated cannot DELETE credit_ledger');

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.credit_ledger', 'INSERT'),
  'authenticated cannot INSERT credit_ledger — the RPCs are the only writers');

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.credit_ledger', 'TRUNCATE'),
  'authenticated cannot TRUNCATE credit_ledger',
  'ACL: ' || (select coalesce(array_to_string(relacl, ' '), 'default')
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'credit_ledger'));

select pg_temp.ok(
  not has_table_privilege('anon', 'public.credit_ledger', 'SELECT'),
  'anon cannot read credit_ledger at all');

-- Denied, not empty. An anon read that returned zero rows would be
-- indistinguishable from a working policy over an ungranted table.
-- `count(_p::text)` consumes the value, so the planner cannot prune the probe.
set local role anon;
select pg_temp.ok(
  pg_temp.attempt(
    $q$select count(_p::text) from (select delta_czk from public.credit_ledger) _p$q$
  ) = 'denied',
  'an anonymous caller is DENIED the ledger outright, not merely shown nothing');
reset role;

set local role authenticated;
select pg_temp.ok(
  pg_temp.attempt(
    $q$update public.credit_ledger set delta_czk = delta_czk + 1000$q$
  ) = 'denied',
  'an authenticated caller cannot rewrite its own balance');
reset role;

-- =============================================================================
-- 6. The ledger stays denominated in CZK
--
-- Credits are a display over money, never a second currency. A `currency`
-- column would be the first step toward two of them, and toward a balance that
-- needs a rate to be read.
-- =============================================================================

select pg_temp.ok(
  pg_temp.col('credit_ledger', 'currency') = 'ABSENT',
  'credit_ledger has no currency column — CZK is the only denomination');

select pg_temp.ok(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'credit_ledger'
      and column_name ~ '_(eur|usd|gbp)$') = 0,
  'no second-currency amount column exists');

-- =============================================================================
-- 7. The expiry sweep is what closes the window
--
-- Not a balance predicate. The sweep writes a compensating negative row, so
-- the ledger explains where the money went — which a filtered query never
-- does.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_credit_batches') = 1,
  'expire_credit_batches exists — the sweep is the thing that closes the window');

select pg_temp.ok(
  (select count(*) from pg_proc
    where proname = 'expire_credit_batches' and prosrc ~* 'insert into') = 1,
  'the sweep WRITES a compensating row rather than hiding the credit');

select pg_temp.ok(
  (select count(*) from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'credit_reason' and e.enumlabel = 'pass_expiry') = 1,
  'credit_reason carries pass_expiry, so the sweep row says why it exists');

-- =============================================================================
-- 8. credit_topups — deny by default, and no client is a writer
--
-- A top-up is a claim that money was sent, made by the player and believed
-- only when an admin confirms it against a bank statement. So the table is
-- readable by its owner and writable by nobody: both writes go through
-- `create_topup` and `confirm_topup`, which are SECURITY DEFINER and carry the
-- authorization inside the function rather than in the route that calls it.
-- =============================================================================

select pg_temp.ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'credit_topups'),
  'credit_topups has RLS enabled');

select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.credit_topups', 'INSERT')
  and not has_table_privilege('authenticated', 'public.credit_topups', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.credit_topups', 'DELETE'),
  'authenticated cannot write credit_topups directly — the RPCs are the writers');

select pg_temp.ok(
  not has_table_privilege('anon', 'public.credit_topups', 'SELECT'),
  'anon cannot read credit_topups at all');

select pg_temp.ok(
  pg_temp.col('credit_topups', 'received_amount_czk') = 'nullable',
  'credit_topups.received_amount_czk is nullable — unknown until confirmed');

select pg_temp.ok(
  pg_temp.col('credit_topups', 'confirmed_at') = 'nullable'
  and pg_temp.col('credit_topups', 'confirmed_by') = 'nullable',
  'confirmed_at and confirmed_by are nullable — a pending top-up has neither');

set local role authenticated;
select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.credit_topups
      (player_id, amount_czk, payment_code, status, city, brand, policy_version)
    values ((select player_id from _fx), 750, 2700000001, 'confirmed',
            'Praha', 'hrajfotbal', 'v1')
  $q$) = 'denied',
  'a direct client INSERT into credit_topups is refused — including status=confirmed');
reset role;

-- =============================================================================
-- 9. The 27-series is its own sequence, and does not collide with bookings
--
-- The variabilní symbol is copied into a Czech banking app and matched back by
-- exact string. Two series sharing a counter would eventually mint one code for
-- a booking and a top-up, and the payment would reconcile against the wrong
-- thing — the one failure here that costs manual work to undo.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_sequences
    where schemaname = 'public' and sequencename = 'topup_payment_code_seq') = 1,
  'topup_payment_code_seq exists, separate from the booking sequence');

select pg_temp.ok(
  left(public.next_topup_code()::text, 2) = '27',
  'a generated top-up VS starts with 27',
  'sample: ' || public.next_topup_code()::text);

select pg_temp.ok(
  left(public.next_payment_code()::text, 2) = '26',
  'a generated booking VS starts with 26 — a different series',
  'sample: ' || public.next_payment_code()::text);

select pg_temp.ok(
  length(public.next_topup_code()::text) = 10,
  'a top-up VS is 10 digits, inside the Czech limit',
  'length: ' || length(public.next_topup_code()::text)::text);

select pg_temp.ok(
  public.next_topup_code() <> public.next_payment_code(),
  'the two series cannot mint the same code');

/*
 * A KNOWN ASYMMETRY, recorded here rather than fixed.
 *
 *   booking_payment_code_seq   maxvalue 99999999
 *   topup_payment_code_seq     maxvalue 9223372036854775807  (bigint default)
 *
 * Both codes are built as `prefix || lpad(nextval::text, 8, '0')`, and `lpad`
 * pads but never truncates. So the booking series is STRUCTURALLY incapable of
 * exceeding ten digits — its sequence runs out first — while the top-up series
 * would silently emit an eleven-digit VS on its hundred-millionth row, past
 * the Czech limit, and the symptom would be a payment that cannot be matched.
 *
 * Not fixed, on purpose: it needs 10^8 top-ups to bite, and capping a sequence
 * is DDL. It is asserted below as the fact it currently is, so that if anyone
 * ever changes the padding or the prefix, the length probe above fails first.
 */
select pg_temp.ok(
  (select max_value from pg_sequences
    where schemaname = 'public' and sequencename = 'booking_payment_code_seq') = 99999999,
  'the booking sequence is capped so its VS cannot outgrow ten digits');

-- =============================================================================
-- 10. An unconfirmed top-up is neither a liability nor spendable
--
-- It writes NOTHING to the ledger. Money that has been claimed but not seen is
-- not money, and a pending row that credited on creation would let a player
-- spend a payment they never made.
-- =============================================================================

create temp table _ledger_count (stage text, n integer) on commit drop;

insert into _ledger_count
select 'before_topup', count(*)::integer from public.credit_ledger
where player_id = (select player_id from _fx);

insert into public.credit_topups
  (player_id, amount_czk, payment_code, status, city, brand, policy_version)
values ((select player_id from _fx), 750, public.next_topup_code(), 'pending',
        'Praha', 'hrajfotbal', 'v1');

insert into _ledger_count
select 'after_pending_topup', count(*)::integer from public.credit_ledger
where player_id = (select player_id from _fx);

select pg_temp.ok(
  (select n from _ledger_count where stage = 'after_pending_topup')
  = (select n from _ledger_count where stage = 'before_topup'),
  'a PENDING top-up writes no credit_ledger row',
  'before=' || (select n from _ledger_count where stage = 'before_topup')::text
  || ' after=' || (select n from _ledger_count where stage = 'after_pending_topup')::text);

select pg_temp.ok(
  (select count(*) from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'credit_reason' and e.enumlabel = 'topup') = 1,
  'credit_reason carries topup, added ahead of the migration that writes it');

-- =============================================================================
-- 11. pass_tiers — five real tiers, pegged at 150
--
-- The 1-game tier is DELETED FROM THE TABLE rather than filtered out of the
-- page, and the difference matters: a filtered page is one query away from
-- showing it again, while a CHECK makes the row unwritable.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.pass_tiers) = 5,
  'pass_tiers holds exactly five rows',
  (select 'count: ' || count(*)::text from public.pass_tiers));

select pg_temp.ok(
  (select array_agg(games order by games) from public.pass_tiers)
    = array[5, 8, 12, 15, 20],
  'the five tiers are 5, 8, 12, 15 and 20 games',
  (select array_agg(games order by games)::text from public.pass_tiers));

select pg_temp.ok(
  (select count(*) from public.pass_tiers where credited_czk <> games * 150) = 0,
  'every tier credits games x 150');

select pg_temp.ok(
  pg_temp.chk('pass_tiers', 'pass_tiers_credited_rule')
    = 'CHECK ((credited_czk = (games * 150)))',
  'the 150 peg is a CHECK, not a convention',
  pg_temp.chk('pass_tiers', 'pass_tiers_credited_rule'));

select pg_temp.ok(
  (select count(*) from public.pass_tiers where games = 1) = 0,
  'no 1-game tier exists');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.pass_tiers (games, price_czk, credited_czk, expires_months)
    values (1, 150, 150, 1)
  $q$) = 'check_violation',
  'a 1-game tier is UNWRITABLE — deleted from the table, not filtered from the page');

select pg_temp.ok(
  pg_temp.attempt($q$
    insert into public.pass_tiers (games, price_czk, credited_czk, expires_months)
    values (25, 4000, 3000, 2)
  $q$) = 'check_violation',
  'a tier priced above what it credits is refused — a pass is never a penalty');

-- =============================================================================
-- 12. The v2.5 event types the top-up and photo flows emit
--
-- events.event_type is one CHECK, and a migration emitting a new type has to
-- widen it in the same migration. Forgetting fails at the first WRITE, naming a
-- constraint that has nothing to do with the feature — migration 24 added the
-- photo events and omitted the top-up ones, and the first create_topup failed
-- on the catalog.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'events'
      and con.conname = 'events_event_type_catalog'
      and pg_get_constraintdef(con.oid) like '%''topup_requested''%'
      and pg_get_constraintdef(con.oid) like '%''topup_confirmed''%'
      and pg_get_constraintdef(con.oid) like '%''profile_photo_removed''%'
      and pg_get_constraintdef(con.oid) like '%''player_anonymized''%') = 1,
  'the catalog covers all four v2.5 event types in one CHECK');

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
