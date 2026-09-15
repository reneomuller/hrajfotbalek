-- =============================================================================
-- ROUND 27, ITEM 2 — add guests after booking, drilled.
--
-- Run:  node supabase/tests/run.mjs add_guests_after_booking
--
-- MOVED OUT OF THE MIGRATION (2026-09-12). Its drill built a venue, two games
-- and bookings against a real player; on a committing apply those persist.
-- The migration now asserts SHAPE — columns, constraints, the widened event
-- catalog, the functions — and the behaviour is drilled here.
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
  ('a0000000-0000-0000-0000-0000000d9e01', 'ag1@test.invalid'),
  ('a0000000-0000-0000-0000-0000000d9e02', 'ag2@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-0000000d9e01', 'GuestHost', 'ag1@test.invalid',
   'a0000000-0000-0000-0000-0000000d9e01'),
  ('aaaa0000-0000-0000-0000-0000000d9e02', 'GuestFiller', 'ag2@test.invalid',
   'a0000000-0000-0000-0000-0000000d9e02');

-- CAPACITY THREE: room for the host, one added guest, and then nothing. The
-- only arrangement that exercises both endings in one drill.
insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9d000000-0000-0000-0000-0000000d9e01', 'Guest Pitch',
   now() + interval '2 days', 3, 150, 'published');

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk,
                             credit_applied_czk, guest_count)
  values ('7d000000-0000-0000-0000-0000000d9e01', '9d000000-0000-0000-0000-0000000d9e01',
          'aaaa0000-0000-0000-0000-0000000d9e01', 'confirmed', 'qr', 150, 0, 0);

create function pg_temp.guests_on(p_booking uuid) returns integer
language sql security definer as $$
  select guest_count from public.bookings where id = p_booking;
$$;

create function pg_temp.seats() returns integer language sql security definer as $$
  select public.game_seats_taken('9d000000-0000-0000-0000-0000000d9e01');
$$;

-- =============================================================================
-- can_add_guests bounds the control
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000d9e01');
select pg_temp.ok(
  public.can_add_guests('7d000000-0000-0000-0000-0000000d9e01') = 2,
  'two further guests fit on a capacity-three pitch with one seat taken',
  public.can_add_guests('7d000000-0000-0000-0000-0000000d9e01')::text);
reset role;

-- SOMEBODY ELSE'S BOOKING IS ZERO, not an error — the panel simply does not render.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000d9e02');
select pg_temp.ok(
  public.can_add_guests('7d000000-0000-0000-0000-0000000d9e01') = 0,
  'a stranger may add no guests to a booking that is not theirs');
reset role;

-- =============================================================================
-- the online rail — an open add-guest checkout holds NOTHING
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000d9e01');
select public.open_add_guests_checkout(
  '7d000000-0000-0000-0000-0000000d9e01', 1, 'cs_test_addguest', 150);
reset role;

select pg_temp.ok(
  pg_temp.seats() = 1,
  'an open add-guest checkout takes no seat', pg_temp.seats()::text);

select pg_temp.act_as_service();
select public.settle_checkout_session('cs_test_addguest', 150);
reset role;

select pg_temp.ok(
  pg_temp.guests_on('7d000000-0000-0000-0000-0000000d9e01') = 1,
  'the webhook adds the guest to the existing booking',
  pg_temp.guests_on('7d000000-0000-0000-0000-0000000d9e01')::text);

-- THE SEAT COUNT MOVED BY ONE, not two: the player was already counted.
select pg_temp.ok(
  pg_temp.seats() = 2,
  'the seat count moves by the guests only', pg_temp.seats()::text);

-- "<Name>'s Guest 1" — the numbering continues for free, from generate_series.
select pg_temp.ok(
  (select count(*) from public.game_roster_public r
    where r.game_id = '9d000000-0000-0000-0000-0000000d9e01'
      and r.is_guest and r.guest_index = 1) = 1,
  'the roster publishes Guest 1 under its host');

-- REDELIVERY IS A NO-OP. Stripe is at-least-once.
select pg_temp.act_as_service();
select pg_temp.ok(
  public.settle_checkout_session('cs_test_addguest', 150) = 'already',
  'a redelivered webhook is inert');
reset role;

select pg_temp.ok(
  pg_temp.guests_on('7d000000-0000-0000-0000-0000000d9e01') = 1,
  'redelivery did not add a second guest');

-- =============================================================================
-- the pitch is now full — both rails refuse, and money that arrives is credited
-- =============================================================================

insert into public.bookings (game_id, player_id, status, payment_method, price_czk,
                             credit_applied_czk, guest_count)
  values ('9d000000-0000-0000-0000-0000000d9e01', 'aaaa0000-0000-0000-0000-0000000d9e02',
          'confirmed', 'qr', 150, 0, 0);

select pg_temp.act_as('a0000000-0000-0000-0000-0000000d9e01');
select pg_temp.ok(
  public.can_add_guests('7d000000-0000-0000-0000-0000000d9e01') = 0,
  'a full pitch offers no further guests');

select pg_temp.ok_probe(
  $q$select public.add_guests_with_credit('7d000000-0000-0000-0000-0000000d9e01', 1)$q$,
  'raise:CAPACITY_FULL',
  'the credit rail refuses when the pitch is full');
reset role;

-- Money that arrives anyway becomes credit IN FULL, and is queued for a human.
insert into public.checkout_sessions
       (stripe_session_id, game_id, player_id, guest_count, amount_czk, kind, target_booking_id)
  values ('cs_test_addguest_late', '9d000000-0000-0000-0000-0000000d9e01',
          'aaaa0000-0000-0000-0000-0000000d9e01', 1, 150, 'add_guests',
          '7d000000-0000-0000-0000-0000000d9e01');

create temp table _credit_before as
  select coalesce(sum(delta_czk), 0) as bal from public.credit_ledger
   where player_id = 'aaaa0000-0000-0000-0000-0000000d9e01';

select pg_temp.act_as_service();
select pg_temp.ok(
  public.settle_checkout_session('cs_test_addguest_late', 150) = 'credited',
  'a payment that lands on a full pitch is credited rather than seated');
reset role;

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
    where player_id = 'aaaa0000-0000-0000-0000-0000000d9e01')
  = (select bal from _credit_before) + 150,
  'credited IN FULL — ruling O''s refund-in-kind');

select pg_temp.ok(
  (select attention_at is not null from public.checkout_sessions
    where stripe_session_id = 'cs_test_addguest_late'),
  'and queued for a human to look at');

select pg_temp.ok(
  pg_temp.seats() <= 3,
  'the game was not oversold', pg_temp.seats()::text);

-- =============================================================================
-- the constraint that keeps the register honest
-- =============================================================================

select pg_temp.ok_probe(
  $q$insert into public.checkout_sessions
       (stripe_session_id, game_id, player_id, guest_count, amount_czk, kind, target_booking_id)
     values ('cs_test_bad', '9d000000-0000-0000-0000-0000000d9e01',
             'aaaa0000-0000-0000-0000-0000000d9e01', 1, 150, 'add_guests', null)
     returning id$q$,
  'error:23514',
  'an add-guest session with no target booking is refused by the constraint');

-- =============================================================================
-- ROUND 34, ITEM 2 — WHAT THE CREDIT RAIL ACTUALLY DEBITS
--
-- The owner asked for this to be verified rather than assumed, and verifying it
-- turned up a divergence worth naming: `add_guests_with_credit` charges
-- `game.price_czk x guests`, NOT `150 x guests`. On a 150 CZK game the two are
-- the same number and the credits ruling holds exactly; on a game priced 180 or
-- 200 — production has both — a guest costs more than one credit.
--
-- THE ASSERTION IS WRITTEN AGAINST THE GAME'S PRICE, because that is what the
-- function does and a test must say what is true. The question of whether a
-- guest SHOULD cost one credit on a 200 CZK game is a money decision and it is
-- the owner's; it is ledger row 277, not a silent change here.
-- =============================================================================

create temp table _debit_fixture as
select '9d000000-0000-0000-0000-0000000d9f02'::uuid as game_id,
       'aaaa0000-0000-0000-0000-0000000d9f02'::uuid as player_id;

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9d000000-0000-0000-0000-0000000d9f02', 'Add Guest Debit', now() + interval '9 days', 10, 200, 'published');

insert into auth.users (id, email) values
  ('6d000000-0000-0000-0000-0000000d9f02', 'agd@test.invalid');
insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-0000000d9f02', 'AddGuestDebit', 'agd@test.invalid',
   '6d000000-0000-0000-0000-0000000d9f02');

-- THREE CREDITS: the seat the booking below is about to spend, plus exactly two
-- guests' worth and not a crown more. `create_booking` applies the wallet inside
-- its own transaction, so granting two here would leave one and the refusal
-- below would fire for the wrong reason.
insert into public.credit_ledger (player_id, delta_czk, reason)
values ('aaaa0000-0000-0000-0000-0000000d9f02', 3 * 180, 'admin_grant');

select pg_temp.act_as('6d000000-0000-0000-0000-0000000d9f02');
select public.create_booking('9d000000-0000-0000-0000-0000000d9f02', 'cash');
reset role;

update public.bookings set status = 'confirmed'
 where game_id = '9d000000-0000-0000-0000-0000000d9f02'
   and player_id = 'aaaa0000-0000-0000-0000-0000000d9f02';

create function pg_temp.debit_booking() returns uuid language sql security definer as $$
  select id from public.bookings
   where game_id = '9d000000-0000-0000-0000-0000000d9f02'
     and player_id = 'aaaa0000-0000-0000-0000-0000000d9f02'
   limit 1
$$;

create function pg_temp.debit_balance() returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger
   where player_id = 'aaaa0000-0000-0000-0000-0000000d9f02'
$$;

-- THE REFUSAL COMES FIRST, so it is made against a balance that has not yet
-- been spent: three guests cost 450 and the wallet holds 300.
select pg_temp.act_as('6d000000-0000-0000-0000-0000000d9f02');
select pg_temp.ok_probe(
  format($q$select public.add_guests_with_credit(%L, 3)$q$, pg_temp.debit_booking()),
  'raise:CREDIT_NEGATIVE_BLOCKED',
  'the credit rail refuses when the balance does not cover the guests');
reset role;

select pg_temp.ok(
  pg_temp.debit_balance() = 2 * 180,
  'and the refusal took nothing — a refused spend that debits is the worst '
  'possible bug in this file',
  pg_temp.debit_balance()::text);

select pg_temp.act_as('6d000000-0000-0000-0000-0000000d9f02');
select public.add_guests_with_credit(pg_temp.debit_booking(), 2);
reset role;

select pg_temp.ok(
  pg_temp.debit_balance() = 0,
  'two guests debit exactly two credits — one each, whatever the game charges',
  pg_temp.debit_balance()::text);

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where booking_id = pg_temp.debit_booking()
      and reason = 'redemption'
      and delta_czk = -2 * 180) = 1,
  'as ONE redemption row, at the credit rate times the guest count');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
