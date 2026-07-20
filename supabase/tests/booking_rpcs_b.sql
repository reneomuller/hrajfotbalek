-- =============================================================================
-- Phase 7 assertions — confirm_booking, expire_booking, game transitions
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/booking_rpcs_b.sql
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
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

create function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

create function pg_temp.booking_id_for(p_game_id uuid)
returns uuid language sql security definer as $$
  select b.id from public.bookings b where b.game_id = p_game_id order by b.created_at limit 1;
$$;

-- Counts events regardless of the role currently in effect.
--
-- Needed because an assertion's ARGUMENTS are evaluated in the caller's
-- context, not inside pg_temp.ok. Reading public.events inline while acting as
-- `authenticated` raises "permission denied for table events" — which is the
-- correct RLS outcome, just not what the assertion was trying to measure.
create function pg_temp.ev_count(p_type text, p_game_id uuid)
returns integer language sql security definer as $$
  select count(*)::int from public.events e
   where e.event_type = p_type and e.game_id = p_game_id;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a@test.invalid'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b@test.invalid'),
  ('d0000000-0000-0000-0000-0000000000d1', 'admin@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'TstPlayerA', 'a@test.invalid',     'a0000000-0000-0000-0000-0000000000a1', false),
  ('bbbb0000-0000-0000-0000-00000000000b', 'TstPlayerB', 'b@test.invalid',     'b0000000-0000-0000-0000-0000000000b1', false),
  ('dddd0000-0000-0000-0000-00000000000d', 'TstAdminM',  'admin@test.invalid', 'd0000000-0000-0000-0000-0000000000d1', true);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('91110000-0000-0000-0000-000000000001', 'Exact',      now() + interval '7 days', 10, 200, 'published'),
  ('92220000-0000-0000-0000-000000000002', 'Over',       now() + interval '7 days', 10, 200, 'published'),
  ('93330000-0000-0000-0000-000000000003', 'Under',      now() + interval '7 days', 10, 200, 'published'),
  ('94440000-0000-0000-0000-000000000004', 'Expiry',     now() + interval '7 days', 10, 200, 'published'),
  ('95550000-0000-0000-0000-000000000005', 'LateP',      now() + interval '7 days', 10, 200, 'published'),
  ('96660000-0000-0000-0000-000000000006', 'Draftie',    now() + interval '7 days', 10, 200, 'draft'),
  ('97770000-0000-0000-0000-000000000007', 'Lifecycle',  now() + interval '7 days', 2,  200, 'published'),
  ('98880000-0000-0000-0000-000000000008', 'CancelMe',   now() + interval '7 days', 10, 200, 'published'),
  ('99990000-0000-0000-0000-000000000009', 'CapEdit',    now() + interval '7 days', 10, 200, 'published'),
  ('9aaa0000-0000-0000-0000-00000000000a', 'CreditExp',  now() + interval '7 days', 10, 200, 'published');

-- =============================================================================
-- authorization
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('91110000-0000-0000-0000-000000000001', 'qr');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok_probe(
  $q$select public.confirm_booking(pg_temp.booking_id_for('91110000-0000-0000-0000-000000000001'))$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot call confirm_booking');

select pg_temp.ok_probe(
  $q$select public.expire_booking(pg_temp.booking_id_for('91110000-0000-0000-0000-000000000001'))$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot call expire_booking');

select pg_temp.ok_probe(
  $q$select public.publish_game('96660000-0000-0000-0000-000000000006')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot publish a game');

select pg_temp.ok_probe(
  $q$select public.cancel_game('98880000-0000-0000-0000-000000000008')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot cancel a game');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '91110000-0000-0000-0000-000000000001') = 'reserved',
  'the booking is untouched after the rejected admin calls');

-- =============================================================================
-- confirm_booking — the three reconciliation paths
-- =============================================================================

-- --- NULL amount: confirm at expected, credit 0 ------------------------------
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(
  (select (public.confirm_booking(
    pg_temp.booking_id_for('91110000-0000-0000-0000-000000000001'),
    'dddd0000-0000-0000-0000-00000000000d')).credit_issued_czk) = 0,
  'a NULL received_amount_czk confirms at the expected amount, credit_issued 0');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '91110000-0000-0000-0000-000000000001') = 'confirmed',
  'the booking moves reserved -> confirmed');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '91110000-0000-0000-0000-000000000001'
      and event_type = 'payment_confirmed') = 1,
  'exactly one payment_confirmed event is written');

-- --- overpayment: confirm AND credit the difference --------------------------
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('92220000-0000-0000-0000-000000000002', 'qr');
reset role;

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(
  (select (public.confirm_booking(
    pg_temp.booking_id_for('92220000-0000-0000-0000-000000000002'),
    'dddd0000-0000-0000-0000-00000000000d', 250)).credit_issued_czk) = 50,
  'overpayment of 250 on a 200 booking returns credit_issued_czk = 50');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '92220000-0000-0000-0000-000000000002') = 'confirmed',
  'the overpaid booking is still confirmed');

select pg_temp.ok(
  (select delta_czk from public.credit_ledger
    where booking_id = pg_temp.booking_id_for('92220000-0000-0000-0000-000000000002')) = 50,
  'exactly one positive ledger row of +50 is written for the difference');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '92220000-0000-0000-0000-000000000002'
      and event_type = 'credit_issued') = 1
  and (select count(*) from public.events
    where game_id = '92220000-0000-0000-0000-000000000002'
      and event_type = 'payment_confirmed') = 1,
  'one credit_issued AND one payment_confirmed, in the same transaction');

-- --- underpayment: refuse ----------------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('93330000-0000-0000-0000-000000000003', 'qr');
reset role;

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok_probe(
  $q$select public.confirm_booking(pg_temp.booking_id_for('93330000-0000-0000-0000-000000000003'),
    'dddd0000-0000-0000-0000-00000000000d', 150)$q$,
  'raise:PAYMENT_UNDERPAID',
  'underpayment of 150 on a 200 booking is refused');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '93330000-0000-0000-0000-000000000003') = 'reserved',
  'the underpaid booking stays reserved');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '93330000-0000-0000-0000-000000000003'
      and event_type = 'payment_confirmed') = 0,
  'no payment_confirmed event is emitted for the underpayment');

-- =============================================================================
-- expire_booking
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('94440000-0000-0000-0000-000000000004', 'qr');
reset role;

select pg_temp.act_as_service();
select public.expire_booking(pg_temp.booking_id_for('94440000-0000-0000-0000-000000000004'));
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '94440000-0000-0000-0000-000000000004') = 'expired',
  'expire_booking moves reserved -> expired');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '94440000-0000-0000-0000-000000000004'
      and event_type in ('booking_expired', 'spot_released')) = 2,
  'booking_expired + spot_released are both written in one transaction',
  (select string_agg(event_type, ', ' order by event_type) from public.events
    where game_id = '94440000-0000-0000-0000-000000000004'
      and event_type in ('booking_expired', 'spot_released')));

select pg_temp.act_as_service();
select pg_temp.ok_probe(
  $q$select public.expire_booking(pg_temp.booking_id_for('94440000-0000-0000-0000-000000000004'))$q$,
  'raise:INVALID_TRANSITION',
  'an already-expired booking cannot be re-expired');

select pg_temp.ok_probe(
  $q$select public.confirm_booking(pg_temp.booking_id_for('91110000-0000-0000-0000-000000000001'),
    'dddd0000-0000-0000-0000-00000000000d')$q$,
  'raise:INVALID_TRANSITION',
  'an already-confirmed booking cannot be re-confirmed');
reset role;

-- --- applied credit is returned on expiry (flagged judgment call) ------------
--
-- Player B's balance at this point is 100, not 50: they already earned 50 from
-- the overpayment confirmation above, and now receive a further 50 grant. So
-- the 200 booking applies the full 100 and expiry must return all 100. Stating
-- the running balance explicitly here because getting it wrong is exactly what
-- made this assertion fail first time round — against a correct RPC.
insert into public.credit_ledger (player_id, delta_czk, reason) values
  ('bbbb0000-0000-0000-0000-00000000000b', 50, 'admin_grant');

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
    where player_id = 'bbbb0000-0000-0000-0000-00000000000b') = 100,
  'player B''s balance before the expiring booking is 100 (50 overpayment + 50 grant)',
  'balance=' || (select coalesce(sum(delta_czk), 0) from public.credit_ledger
                  where player_id = 'bbbb0000-0000-0000-0000-00000000000b'));

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('9aaa0000-0000-0000-0000-00000000000a', 'qr');
reset role;

select pg_temp.ok(
  (select credit_applied_czk from public.bookings
    where game_id = '9aaa0000-0000-0000-0000-00000000000a') = 100,
  'the booking applies the whole 100 balance, leaving 100 due');

select pg_temp.act_as_service();
select pg_temp.ok(
  (select (public.expire_booking(
    pg_temp.booking_id_for('9aaa0000-0000-0000-0000-00000000000a'))).credit_issued_czk) = 100,
  'expiring a booking with applied credit returns ALL of it to the wallet');
reset role;

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
    where player_id = 'bbbb0000-0000-0000-0000-00000000000b') = 100,
  'player B ends where they started: the expiry confiscated nothing',
  'balance=' || (select coalesce(sum(delta_czk), 0) from public.credit_ledger
                  where player_id = 'bbbb0000-0000-0000-0000-00000000000b'));

-- =============================================================================
-- payment landing AFTER expiry — credit in full, spot never reinstated
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('95550000-0000-0000-0000-000000000005', 'qr');
reset role;

select pg_temp.act_as_service();
select public.expire_booking(pg_temp.booking_id_for('95550000-0000-0000-0000-000000000005'));

select pg_temp.ok(
  (select (public.confirm_booking(
    pg_temp.booking_id_for('95550000-0000-0000-0000-000000000005'),
    null, 200)).credit_issued_czk) = 200,
  'a payment landing after expiry is credited IN FULL (200)');
reset role;

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '95550000-0000-0000-0000-000000000005') = 'expired',
  'the booking stays expired — the spot is never reinstated');

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '95550000-0000-0000-0000-000000000005'
      and status in ('reserved', 'confirmed')) = 0,
  'capacity is unchanged: no active booking exists on that game');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '95550000-0000-0000-0000-000000000005'
      and event_type = 'payment_confirmed') = 0,
  'no payment_confirmed is emitted for a post-expiry payment');

-- =============================================================================
-- game transitions
-- =============================================================================

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');

select pg_temp.ok(
  (select public.publish_game('96660000-0000-0000-0000-000000000006')) = 'published',
  'publish_game moves draft -> published');

select pg_temp.ok(
  pg_temp.ev_count('game_published', '96660000-0000-0000-0000-000000000006') = 1,
  'publish_game emits game_published');

select pg_temp.ok_probe(
  $q$select public.publish_game('96660000-0000-0000-0000-000000000006')$q$,
  'raise:INVALID_TRANSITION',
  'publishing an already-published game is rejected');

-- An UNDER-CAPACITY published game can still be played and settled.
select pg_temp.ok(
  (select public.mark_game_played('96660000-0000-0000-0000-000000000006')) = 'played',
  'an under-capacity published game can go straight to played');

select pg_temp.ok(
  (select public.settle_game('96660000-0000-0000-0000-000000000006')) = 'settled',
  'played -> settled succeeds');

select pg_temp.ok(
  pg_temp.ev_count('game_settled', '96660000-0000-0000-0000-000000000006') = 1,
  'settle_game emits game_settled');

select pg_temp.ok_probe(
  $q$select public.settle_game('96660000-0000-0000-0000-000000000006')$q$,
  'raise:INVALID_TRANSITION',
  'settling an already-settled game is rejected');
reset role;

-- --- published <-> full is derived, and `full` can also be played ------------
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('97770000-0000-0000-0000-000000000007', 'cash');
reset role;
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('97770000-0000-0000-0000-000000000007', 'cash');
reset role;

select pg_temp.ok(
  (select status from public.games where id = '97770000-0000-0000-0000-000000000007') = 'full',
  'reaching capacity flips the game to full');

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(
  (select public.mark_game_played('97770000-0000-0000-0000-000000000007')) = 'played',
  'a full game can also be marked played');
reset role;

-- =============================================================================
-- cancel_game — fan-out in one transaction
-- =============================================================================

-- One PAID booking, one UNPAID booking, and a waitlist row.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('98880000-0000-0000-0000-000000000008', 'qr');
reset role;
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select public.confirm_booking(pg_temp.booking_id_for('98880000-0000-0000-0000-000000000008'),
  'dddd0000-0000-0000-0000-00000000000d');
reset role;
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('98880000-0000-0000-0000-000000000008', 'cash');
reset role;

insert into public.waitlist (game_id, player_id) values
  ('98880000-0000-0000-0000-000000000008', 'dddd0000-0000-0000-0000-00000000000d');

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(
  (select public.cancel_game('98880000-0000-0000-0000-000000000008')) = 2,
  'cancel_game reports 2 bookings cancelled');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '98880000-0000-0000-0000-000000000008'
      and status = 'cancelled') = 2,
  'both bookings — paid and unpaid alike — are cancelled');

select pg_temp.ok(
  (select count(*) from public.credit_ledger cl
    join public.bookings b on b.id = cl.booking_id
   where b.game_id = '98880000-0000-0000-0000-000000000008'
     and cl.reason = 'cancellation_credit') = 1,
  'only the PAID booking produces a cancellation_credit row');

select pg_temp.ok(
  (select cl.delta_czk from public.credit_ledger cl
    join public.bookings b on b.id = cl.booking_id
   where b.game_id = '98880000-0000-0000-0000-000000000008'
     and cl.reason = 'cancellation_credit') = 200,
  'the paid player is credited the full 200');

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '98880000-0000-0000-0000-000000000008') = 0,
  'cancel_game leaves no orphaned waitlist rows');

select pg_temp.ok(
  (select status from public.games where id = '98880000-0000-0000-0000-000000000008') = 'cancelled',
  'the game itself is cancelled');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '98880000-0000-0000-0000-000000000008'
      and event_type = 'game_cancelled') = 1,
  'game_cancelled is emitted once');

select pg_temp.ok(
  (select count(*) from public.events
    where game_id = '98880000-0000-0000-0000-000000000008'
      and event_type = 'spot_released') = 0,
  'no spot_released is emitted — a cancelled game has no spots to release');

-- =============================================================================
-- capacity edit rule
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('99990000-0000-0000-0000-000000000009', 'cash');
reset role;
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('99990000-0000-0000-0000-000000000009', 'cash');
reset role;

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok_probe(
  $q$select public.set_game_capacity('99990000-0000-0000-0000-000000000009', 1)$q$,
  'raise:CAPACITY_BELOW_ACTIVE_BOOKINGS',
  'lowering capacity below the active-booking count is rejected');

select pg_temp.ok(
  (select public.set_game_capacity('99990000-0000-0000-0000-000000000009', 2)) = 2,
  'lowering capacity to exactly the active count is allowed');

select pg_temp.ok(
  (select status from public.games where id = '99990000-0000-0000-0000-000000000009') = 'full',
  'and the game flips to full as a result');
reset role;

-- =============================================================================
-- ledger integrity
-- =============================================================================

select pg_temp.ok(
  not exists (select 1 from public.credit_ledger group by player_id having sum(delta_czk) < 0),
  'no player''s ledger sums below zero anywhere in this run');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
