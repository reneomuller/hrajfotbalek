-- =============================================================================
-- ROUND 35 v2 — credits are seat-denominated, drilled on a 200 CZK fixture.
--
-- Run:  node supabase/tests/run.mjs credits_are_seats
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

-- THE FIXTURE IS PRICED 200 ON PURPOSE, and the number moved with the ruling.
-- ~~180, because at 150 the ruling and the old price-based debit were the same
-- number.~~ 180 IS NOW THE CREDIT RATE, so a fixture at 180 would be the
-- coincidence this suite exists to avoid — a seat costing one credit and one
-- game price at once proves nothing about which rule produced it. 200 is a
-- price no game carries any more, which is exactly what makes it a good probe:
-- the seat must still cost 180.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000f1', 'cas-a@test.invalid'),
  ('60000000-0000-0000-0000-0000000000f2', 'cas-b@test.invalid'),
  ('60000000-0000-0000-0000-0000000000f3', 'cas-c@test.invalid'),
  ('60000000-0000-0000-0000-0000000000f4', 'cas-d@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('6fff0000-0000-0000-0000-0000000000f1', 'SeatCreditA', 'cas-a@test.invalid', '60000000-0000-0000-0000-0000000000f1'),
  ('6fff0000-0000-0000-0000-0000000000f2', 'SeatCreditB', 'cas-b@test.invalid', '60000000-0000-0000-0000-0000000000f2'),
  ('6fff0000-0000-0000-0000-0000000000f3', 'SeatCreditC', 'cas-c@test.invalid', '60000000-0000-0000-0000-0000000000f3'),
  ('6fff0000-0000-0000-0000-0000000000f4', 'SeatCreditD', 'cas-d@test.invalid', '60000000-0000-0000-0000-0000000000f4');

-- CREDIT NEEDS A NINETY-MINUTE PITCH (round 35 v5, item 1). A credit buys one
-- 90-minute seat, and a fixture with no duration is a SIXTY-minute game, which
-- takes no credit at all — so every game a credit is spent on below says how
-- long it is. The price follows from that, which is why none of these rows
-- states one it chose.
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('9fff0000-0000-0000-0000-0000000000f1', 'Seat Credit 200', now() + interval '30 hours', 20, 200, 'published', 90),
  ('9fff0000-0000-0000-0000-0000000000f2', 'Seat Credit Mixed', now() + interval '31 hours', 20, 200, 'published', 90),
  ('9fff0000-0000-0000-0000-0000000000f3', 'Seat Credit Free', now() + interval '32 hours', 20, 0, 'published', 90);

create function pg_temp.bal(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

create function pg_temp.bk(p_game uuid, p_player uuid) returns public.bookings
language sql security definer as $$
  select * from public.bookings
   where game_id = p_game and player_id = p_player
     and status in ('reserved', 'confirmed') limit 1
$$;

-- =============================================================================
-- THE RULING — one seat is one credit on a 180 CZK game
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason)
values ('6fff0000-0000-0000-0000-0000000000f1', 720, 'admin_grant');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f1');
select public.create_booking('9fff0000-0000-0000-0000-0000000000f1', 'cash');
reset role;

select pg_temp.ok(
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1') = 540,
  'ONE SEAT ON A 200 CZK GAME DEBITS 180 — one credit, not the game price',
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1')::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).status = 'confirmed',
  'and the seat is PAID — a flat credit settles it in full, whatever the card '
  'price is');

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).payment_method = 'credit',
  'the derived method is credit');

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).price_czk = 180,
  'and price_czk is what the booking is WORTH — 180, the credit it cost, not '
  'the 200 a card would have paid',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).price_czk::text);

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where player_id = '6fff0000-0000-0000-0000-0000000000f1'
      and reason = 'redemption' and delta_czk = -180) = 1,
  'the ledger records −180, exactly one credit');

-- =============================================================================
-- ADD GUESTS — two guests cost two credits, on the same 180 CZK game
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f1');
select public.add_guests_with_credit(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).id, 2);
reset role;

select pg_temp.ok(
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1') = 180,
  'TWO GUESTS DEBIT 360 — two credits, whatever the game charges a card',
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1')::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).price_czk = 540,
  'the booking is now worth three credits',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).price_czk::text);

-- =============================================================================
-- AND ONE OF THOSE GUESTS COMES BACK AS EXACTLY ONE CREDIT
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f1');
select pg_temp.ok(
  (public.cancel_guests(
     (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
                 '6fff0000-0000-0000-0000-0000000000f1')).id, 1)).credit_issued_czk = 180,
  'REMOVING ONE CREDIT-PAID GUEST RETURNS +180 — exactly one credit');
reset role;

select pg_temp.ok(
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1') = 360,
  'and the balance says so',
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f1')::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).credit_applied_czk = 360,
  'the booking still holds two credits'' worth',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f1')).credit_applied_czk::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'booking_guests_removed'
      and game_id = '9fff0000-0000-0000-0000-0000000000f1'
      and (metadata ->> 'seats_from_credit')::int = 1
      and (metadata ->> 'seats_from_card')::int = 0) = 1,
  'and the event says the seat came off the credit side');

-- =============================================================================
-- A MIXED BOOKING — one credit, two card seats, on a 180 CZK game
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason)
values ('6fff0000-0000-0000-0000-0000000000f2', 180, 'admin_grant');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f2');
select public.create_booking('9fff0000-0000-0000-0000-0000000000f2', 'qr', null, null, 2);
reset role;

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).credit_applied_czk = 180,
  'one credit covers ONE seat and no more — never a slice of the other two',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).credit_applied_czk::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).price_czk = 180 + 2 * 200,
  'and the price is one credit seat plus two CARD seats at the game''s own price',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).price_czk::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).status = 'reserved',
  'the booking is not settled — two seats are still owed');

-- The credit seat comes off first, which is the choice the migration states.
select pg_temp.act_as('60000000-0000-0000-0000-0000000000f2');
select pg_temp.ok(
  (public.cancel_guests(
     (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
                 '6fff0000-0000-0000-0000-0000000000f2')).id, 1)).credit_issued_czk = 180,
  'removing one guest from a mixed booking returns the CREDIT seat first — one '
  'whole credit, not a share of a card payment');
reset role;

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).credit_applied_czk = 0,
  'the credit side is emptied',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).credit_applied_czk::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).price_czk = 2 * 200,
  'and what is left is two card seats',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f2',
              '6fff0000-0000-0000-0000-0000000000f2')).price_czk::text);

-- =============================================================================
-- A FREE GAME SPENDS NO CREDIT — the one case seat-denomination could cost a
-- player something for nothing
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason)
values ('6fff0000-0000-0000-0000-0000000000f3', 360, 'admin_grant');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f3');
select public.create_booking('9fff0000-0000-0000-0000-0000000000f3', 'cash');
reset role;

select pg_temp.ok(
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f3') = 360,
  'a game priced at zero takes no credit',
  pg_temp.bal('6fff0000-0000-0000-0000-0000000000f3')::text);

-- =============================================================================
-- AN EMPTY WALLET IS UNCHANGED — the card rail still charges the game's price
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000f4');
select public.create_booking('9fff0000-0000-0000-0000-0000000000f1', 'qr', null, null, 1);
reset role;

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f4')).price_czk = 2 * 200,
  'WITHOUT CREDIT NOTHING CHANGES — two seats at the game''s own 200',
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f4')).price_czk::text);

select pg_temp.ok(
  (pg_temp.bk('9fff0000-0000-0000-0000-0000000000f1',
              '6fff0000-0000-0000-0000-0000000000f4')).credit_applied_czk = 0,
  'and no credit was applied');

-- =============================================================================
-- THE CEILING IS THE SEATS, NOT THE WALLET — a rich player booking one seat
-- spends one credit
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where player_id = '6fff0000-0000-0000-0000-0000000000f1'
      and reason = 'redemption') = 2,
  'two redemptions in all: the seat and the guests — never one per crown');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
