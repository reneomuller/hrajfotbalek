-- =============================================================================
-- Migration 25 assertions — credit_topups, create_topup, confirm_topup
--
-- Run:  node supabase/tests/run.mjs credit_topups
--
-- Transaction-wrapped and rolled back. `call()` consumes the value it selects.
--
-- THIS ONE IS ABOUT MONEY, so it is written in the adversarial shape the
-- booking suites use: most assertions are attempts that must be refused, tried
-- as the wrong role or against the wrong row. A top-up that credits twice, or
-- credits the wrong wallet, is not a bug that shows up as an error message —
-- it shows up as a balance somebody spends.
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

create function pg_temp.balance(p_player uuid)
returns integer language sql as $$
  select coalesce(sum(delta_czk), 0)::integer
  from public.credit_ledger where player_id = p_player;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000fc001'::uuid, 'tu-admin@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fc002'::uuid, 'tu-payer@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fc003'::uuid, 'tu-other@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('bbbb0000-0000-0000-0000-0000000fc001'::uuid, 'TuAdmin', 'tu-admin@test.invalid',
   'a0000000-0000-0000-0000-0000000fc001'::uuid, true),
  ('bbbb0000-0000-0000-0000-0000000fc002'::uuid, 'TuPayer', 'tu-payer@test.invalid',
   'a0000000-0000-0000-0000-0000000fc002'::uuid, false),
  ('bbbb0000-0000-0000-0000-0000000fc003'::uuid, 'TuOther', 'tu-other@test.invalid',
   'a0000000-0000-0000-0000-0000000fc003'::uuid, false);

-- =============================================================================
-- create_topup — the session is the owner, and there is no argument to say
-- otherwise
-- =============================================================================

set local role anon;
select pg_temp.ok_call($q$select public.create_topup(300)$q$, 'denied',
  'anon holds no execute privilege on create_topup');
reset role;

select pg_temp.ok(
  pg_temp.call($q$select public.create_topup(300)$q$) = 'raise:INSUFFICIENT_PERMISSION',
  'a session-less caller cannot create a top-up');

-- There is no player argument. That is the property, not an implementation
-- detail: a top-up created against somebody else's wallet is unspendable money
-- in the wrong place.
select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_topup'
     and pg_get_function_identity_arguments(p.oid) = 'p_amount_czk integer') = 1,
  'create_topup takes an amount and nothing else');

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc002'::uuid);

select pg_temp.ok(pg_temp.call($q$select public.create_topup(49)$q$)
  = 'raise:AMOUNT_OUT_OF_RANGE', 'below the minimum is refused');
select pg_temp.ok(pg_temp.call($q$select public.create_topup(2001)$q$)
  = 'raise:AMOUNT_OUT_OF_RANGE', 'above the maximum is refused');
select pg_temp.ok(pg_temp.call($q$select public.create_topup(0)$q$)
  = 'raise:AMOUNT_OUT_OF_RANGE', 'zero is refused');
select pg_temp.ok(pg_temp.call($q$select public.create_topup(-300)$q$)
  = 'raise:AMOUNT_OUT_OF_RANGE', 'a negative amount is refused');
select pg_temp.ok(pg_temp.call($q$select public.create_topup(null)$q$)
  = 'raise:AMOUNT_OUT_OF_RANGE', 'a null amount is refused rather than defaulted');

-- The boundaries themselves are legal.
select pg_temp.ok(pg_temp.call($q$select (public.create_topup(50)).amount_czk$q$) = '50',
  'the minimum itself is accepted');
select pg_temp.ok(pg_temp.call($q$select (public.create_topup(2000)).amount_czk$q$) = '2000',
  'the maximum itself is accepted');

select pg_temp.ok(
  pg_temp.call($q$select (public.create_topup(300)).status$q$) = 'pending',
  'a new top-up is pending');

reset role;

-- =============================================================================
-- a pending top-up is not money
-- =============================================================================

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 0,
  'three pending top-ups have moved the balance by exactly nothing');

select pg_temp.ok(
  (select count(*) from public.credit_ledger
   where player_id = 'bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 0,
  'a pending top-up writes no ledger row at all');

select pg_temp.ok(
  (select count(*) from public.events
   where event_type = 'topup_requested'
     and player_id = 'bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 3,
  'each request wrote its event');

-- =============================================================================
-- the '27' series, distinct from booking's '26'
-- =============================================================================

select pg_temp.ok(
  (select bool_and(payment_code::text like '27%' and length(payment_code::text) = 10)
   from public.credit_topups),
  'every top-up VS is 27 + 8 digits, inside the Czech 10-digit limit');

select pg_temp.ok(
  (select count(distinct payment_code) from public.credit_topups)
    = (select count(*) from public.credit_topups),
  'variable symbols are unique');

-- The two series cannot collide, which is what lets a bank statement be read
-- without opening the app.
select pg_temp.ok(
  not exists (
    select 1 from public.credit_topups t
    join public.bookings b on b.payment_code = t.payment_code),
  'no top-up VS collides with a booking VS');

-- =============================================================================
-- no client writes, and no cross-player reads
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc002'::uuid);

select pg_temp.ok_do(
  $q$insert into public.credit_topups (player_id, amount_czk, payment_code)
     values ('bbbb0000-0000-0000-0000-0000000fc002'::uuid, 5000, 2700009999)$q$,
  'denied',
  'a player cannot insert a top-up directly, bypassing the bounds');

select pg_temp.ok_do(
  $q$update public.credit_topups set status = 'confirmed'$q$,
  'denied',
  'a player cannot confirm their own top-up by writing the column');

select pg_temp.ok_do(
  $q$delete from public.credit_topups$q$,
  'denied',
  'a player cannot delete a top-up');

select pg_temp.ok(
  (select count(*) from public.credit_topups) = 3,
  'the owner reads their own three top-ups');

reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc003'::uuid);
select pg_temp.ok(
  (select count(*) from public.credit_topups) = 0,
  'another player reads none of them');
reset role;

set local role anon;
select pg_temp.ok_call(
  $q$select count(_p::text) from (select amount_czk from public.credit_topups) _p$q$,
  'denied',
  'anon is refused the table outright');
reset role;

-- =============================================================================
-- confirm_topup — who may, and who may not
-- =============================================================================

-- A named row to work against for the rest of the suite.
insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc001'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc002'::uuid, 300, 2700001111);

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc002'::uuid);
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'the payer cannot confirm their own top-up — that is the bank''s word, not theirs');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc003'::uuid);
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'another ordinary player cannot confirm somebody else''s top-up');
reset role;

set local role anon;
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid)$q$,
  'denied',
  'anon holds no execute privilege on confirm_topup');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select public.confirm_topup('99990000-0000-0000-0000-00000000dead'::uuid)$q$,
  'raise:TOPUP_NOT_FOUND',
  'confirming a top-up that does not exist is refused');

-- The happy path: no received amount means the amount asked for.
select pg_temp.ok_call(
  $q$select (public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid)).credited_czk$q$,
  '300',
  'a null received amount credits the amount the player asked for');
reset role;

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 300,
  'the balance moved by exactly the credited amount');

select pg_temp.ok(
  (select count(*) from public.credit_ledger
   where player_id = 'bbbb0000-0000-0000-0000-0000000fc002'::uuid
     and delta_czk = 300 and reason = 'topup') = 1,
  'the ledger row reads topup, not admin_grant — a payment is not a gift');

select pg_temp.ok(
  (select count(*) from public.events
   where event_type = 'topup_confirmed'
     and metadata->>'topup_id' = 'ccc00000-0000-0000-0000-0000000fc001') = 1,
  'confirmation wrote its event in the same transaction');

-- =============================================================================
-- double confirmation — the assertion this whole suite exists for
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid)$q$,
  'raise:TOPUP_NOT_PENDING',
  'confirming an already-confirmed top-up is refused');

-- A second admin, arriving at the same VS-sorted list a moment later, must also
-- be refused — the refusal is a property of the row, not of the person.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc001'::uuid,
      'bbbb0000-0000-0000-0000-0000000fc001'::uuid, 300)$q$,
  'raise:TOPUP_NOT_PENDING',
  'a second confirmation with an explicit amount is refused too');
reset role;

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 300,
  'the balance did NOT move on the refused confirmations');

select pg_temp.ok(
  (select count(*) from public.credit_ledger
   where player_id = 'bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 1,
  'exactly one ledger row exists for one top-up');

-- =============================================================================
-- the received amount is what is credited
-- =============================================================================

insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc002'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc002'::uuid, 300, 2700002222);

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select (public.confirm_topup('ccc00000-0000-0000-0000-0000000fc002'::uuid, null, 250)).credited_czk$q$,
  '250',
  'a short payment credits what arrived — a top-up has no price to be short of');
reset role;

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 550,
  'the balance reflects the received amount, not the requested one');

select pg_temp.ok(
  (select received_amount_czk from public.credit_topups
   where id = 'ccc00000-0000-0000-0000-0000000fc002'::uuid) = 250
  and (select amount_czk from public.credit_topups
   where id = 'ccc00000-0000-0000-0000-0000000fc002'::uuid) = 300,
  'the requested amount is kept as a record of intent alongside what arrived');

-- Over the asked-for amount is credited in full as well. There is no
-- overpayment rule here, because there was nothing to overpay.
insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc003'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc002'::uuid, 150, 2700003333);

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select (public.confirm_topup('ccc00000-0000-0000-0000-0000000fc003'::uuid, null, 500)).credited_czk$q$,
  '500',
  'more than asked for is credited in full, with no split into a separate grant');

-- Zero or negative would be a refund, not a top-up, and belongs nowhere near
-- this function.
--
-- Fixtures are inserted as the suite's own role: `authenticated` holds SELECT
-- and nothing else on this table, by design, so a bare insert here would abort
-- the transaction rather than fail an assertion.
reset role;
insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc004'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc002'::uuid, 150, 2700004444);
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);

select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc004'::uuid, null, 0)$q$,
  'raise:AMOUNT_OUT_OF_RANGE',
  'crediting zero is refused');
select pg_temp.ok_call(
  $q$select public.confirm_topup('ccc00000-0000-0000-0000-0000000fc004'::uuid, null, -100)$q$,
  'raise:AMOUNT_OUT_OF_RANGE',
  'crediting a negative amount is refused — the ledger never goes backwards here');
reset role;

select pg_temp.ok(
  (select status from public.credit_topups
   where id = 'ccc00000-0000-0000-0000-0000000fc004'::uuid) = 'pending',
  'a refused confirmation leaves the row pending for a real one');

-- =============================================================================
-- the returned balance is the real one
-- =============================================================================

insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc005'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc003'::uuid, 200, 2700005555);

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fc001'::uuid);
select pg_temp.ok_call(
  $q$select (public.confirm_topup('ccc00000-0000-0000-0000-0000000fc005'::uuid)).balance_czk$q$,
  '200',
  'the returned balance is the wallet total, ready for the receipt email');
reset role;

-- ...and it credited the right wallet. Cross-player contamination is the
-- failure that would be discovered by a player, not by a test.
select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc003'::uuid) = 200
  and pg_temp.balance('bbbb0000-0000-0000-0000-0000000fc002'::uuid) = 1050,
  'each wallet received only its own top-ups');

-- =============================================================================
-- service_role may confirm, because a bank poller is not a person
-- =============================================================================

insert into public.credit_topups (id, player_id, amount_czk, payment_code)
values ('ccc00000-0000-0000-0000-0000000fc006'::uuid,
        'bbbb0000-0000-0000-0000-0000000fc003'::uuid, 100, 2700006666);

set local role service_role;
select pg_temp.ok_call(
  $q$select (public.confirm_topup('ccc00000-0000-0000-0000-0000000fc006'::uuid)).credited_czk$q$,
  '100',
  'service_role can confirm — the automation seam a future bank poller uses');
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
