-- =============================================================================
-- ROUND 42 — what a pitch costs, and what each seat on it earned.
--
-- The owner, on the admin rebuild: "In the venues, let there be an area for
-- 'pitch cost' and have there be two values, one for summer and another for
-- winter, with a simple toggle" — 1200 winter, 800 summer for all, to start —
-- and "I do want the profit and break-even per game", telling "someone
-- purchasing a single credit" from "a credit from a game pass that'd make their
-- entry cheaper".
--
--   * a venue has a summer and a winter price; ONE switch picks the season
--   * a game keeps the price it was created with; an admin may correct it
--   * none of it is public: what the owner pays for a pitch is not a price
--     a player should be able to read off the API
--   * a seat is worth what the player PAID for it: a pass Credit is the pass
--     price over its games, an admin's gift is worth nothing, a refund keeps
--     what was paid
--   * money kept from a late cancellation counts; a refunded one does not
--
-- Run:  node supabase/tests/run.mjs pitch_costs
-- =============================================================================
begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, coalesce(cond, false), detail);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end $$;

create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  -- `count(_p::text)`, never `count(*)` — see cancel_guests.sql.
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

create function pg_temp.cost(p_game uuid)
returns integer language sql as $$
  select cost_czk from public.game_pitch_costs where game_id = p_game
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email)
select ('42450000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r42p-' || n || '@test.invalid'
  from generate_series(1, 13) n;

insert into public.players (id, nickname, email, auth_user_id, is_admin)
select ('4e450000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'R42P' || n, 'r42p-' || n || '@test.invalid',
       ('42450000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       n = 13
  from generate_series(1, 13) n;

-- 4e45…13 is the admin; 4e45…01–12 are players, one per way of paying.

insert into public.venues (id, name) values
  ('94245000-0000-0000-0000-0000000000c1', 'R42P North'),
  ('94245000-0000-0000-0000-0000000000c2', 'R42P South');

-- =============================================================================
-- A VENUE STARTS AT 800 IN SUMMER AND 1200 IN WINTER
-- =============================================================================

select pg_temp.ok(
  (select summer_czk = 800 and winter_czk = 1200
     from public.venue_pitch_costs where venue_id = '94245000-0000-0000-0000-0000000000c1'),
  'a new venue starts at 800 in summer and 1200 in winter',
  (select summer_czk || '/' || winter_czk
     from public.venue_pitch_costs where venue_id = '94245000-0000-0000-0000-0000000000c1'));

select pg_temp.ok(public.pitch_season() in ('summer', 'winter'),
  'there is always a season', public.pitch_season());

-- =============================================================================
-- NONE OF IT IS PUBLIC
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe($q$select * from public.venue_pitch_costs$q$, 'denied',
  'a signed-out visitor cannot read what a pitch costs');
select pg_temp.ok_probe($q$select * from public.game_pitch_costs$q$, 'denied',
  'nor what a game''s pitch cost');
select pg_temp.ok_probe($q$select * from public.pitch_settings$q$, 'denied',
  'nor the season switch');
select pg_temp.ok_probe(
  $q$select public.set_venue_pitch_costs('94245000-0000-0000-0000-0000000000c1'::uuid, 900, 1300)$q$,
  'denied', 'a signed-out visitor cannot set a pitch cost');
select pg_temp.ok_probe(
  $q$select * from public.game_economics(array['94245000-0000-0000-0000-0000000000e1'::uuid])$q$,
  'denied', 'nor read a game''s profit');
reset role;

select pg_temp.act_as('42450000-0000-0000-0000-000000000001');
select pg_temp.ok_probe($q$select * from public.venue_pitch_costs$q$, 'denied',
  'a signed-in player cannot read what a pitch costs either');
select pg_temp.ok_probe($q$select * from public.game_pitch_costs$q$, 'denied',
  'nor what a game''s pitch cost');
select pg_temp.ok_probe(
  $q$select public.set_venue_pitch_costs('94245000-0000-0000-0000-0000000000c1'::uuid, 900, 1300)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot set a pitch cost');
select pg_temp.ok_probe($q$select public.set_pitch_season('summer')$q$,
  'raise:INSUFFICIENT_PERMISSION', 'nor flip the season');
select pg_temp.ok_probe(
  $q$select * from public.game_economics(array['94245000-0000-0000-0000-0000000000e1'::uuid])$q$,
  'raise:INSUFFICIENT_PERMISSION', 'nor read a game''s profit');
reset role;

-- =============================================================================
-- AN ADMIN SETS THE TWO PRICES AND THE SEASON
-- =============================================================================

select pg_temp.act_as('42450000-0000-0000-0000-000000000013');
select pg_temp.ok_probe(
  $q$select public.set_venue_pitch_costs('94245000-0000-0000-0000-0000000000c1'::uuid, 900, 1300)$q$,
  'rows:1', 'an admin sets a venue''s summer and winter price');
select pg_temp.ok_probe(
  $q$select public.set_venue_pitch_costs('94245000-0000-0000-0000-0000000000c1'::uuid, -1, 1300)$q$,
  'raise:PITCH_COST_OUT_OF_RANGE', 'a negative price is refused');
select pg_temp.ok_probe(
  $q$select public.set_venue_pitch_costs('00000000-0000-0000-0000-000000000000'::uuid, 900, 1300)$q$,
  'raise:VENUE_NOT_FOUND', 'and so is a venue that does not exist');
select pg_temp.ok_probe($q$select public.set_pitch_season('spring')$q$,
  'raise:INVALID_PITCH_SEASON', 'there are two seasons, not four');
select pg_temp.ok_probe($q$select public.set_pitch_season('summer')$q$,
  'rows:1', 'an admin switches to summer');
reset role;

select pg_temp.ok(
  (select summer_czk = 900 and winter_czk = 1300
     from public.venue_pitch_costs where venue_id = '94245000-0000-0000-0000-0000000000c1'),
  'both prices stored');
select pg_temp.ok(public.pitch_season() = 'summer', 'the season is summer', public.pitch_season());

-- =============================================================================
-- A GAME KEEPS THE PRICE IT WAS CREATED WITH
-- =============================================================================

insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94245000-0000-0000-0000-0000000000a1', 'R42P North', '94245000-0000-0000-0000-0000000000c1',
   now() + interval '3 days', 14, 180, 'published', 90);

select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a1') = 900,
  'a game created in summer takes the venue''s summer price',
  coalesce(pg_temp.cost('94245000-0000-0000-0000-0000000000a1')::text, 'null'));

select pg_temp.act_as('42450000-0000-0000-0000-000000000013');
select public.set_pitch_season('winter');
reset role;

insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94245000-0000-0000-0000-0000000000a2', 'R42P North', '94245000-0000-0000-0000-0000000000c1',
   now() + interval '4 days', 14, 180, 'published', 90),
  ('94245000-0000-0000-0000-0000000000a0', 'R42P Nowhere', null,
   now() + interval '4 days', 14, 180, 'published', 90);

select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a1') = 900,
  'switching to winter leaves an existing game at the price it was made with');
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a2') = 1300,
  'a game created in winter takes the winter price',
  coalesce(pg_temp.cost('94245000-0000-0000-0000-0000000000a2')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a0') is null,
  'a game with no venue has no pitch cost rather than an invented one');

select pg_temp.act_as('42450000-0000-0000-0000-000000000013');
select public.set_venue_pitch_costs('94245000-0000-0000-0000-0000000000c1', 700, 1100);
reset role;
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a2') = 1300,
  'repricing the venue leaves its existing games alone');

-- --- an admin corrects one game --------------------------------------------

select pg_temp.act_as('42450000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_pitch_cost('94245000-0000-0000-0000-0000000000a2'::uuid, 1000)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot correct a game''s pitch cost');
reset role;

select pg_temp.act_as('42450000-0000-0000-0000-000000000013');
select pg_temp.ok_probe(
  $q$select public.set_game_pitch_cost('94245000-0000-0000-0000-0000000000a2'::uuid, 1000)$q$,
  'rows:1', 'an admin corrects one game''s pitch cost');
select pg_temp.ok_probe(
  $q$select public.set_game_pitch_cost('94245000-0000-0000-0000-0000000000a2'::uuid, 100001)$q$,
  'raise:PITCH_COST_OUT_OF_RANGE', 'a typo of an extra zero or two is refused');
select pg_temp.ok_probe(
  $q$select public.set_game_pitch_cost('00000000-0000-0000-0000-000000000000'::uuid, 1000)$q$,
  'raise:GAME_NOT_FOUND', 'and so is a game that does not exist');
reset role;
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a2') = 1000, 'the correction is stored');

-- --- moving a game to another venue ----------------------------------------

update public.games set venue_id = '94245000-0000-0000-0000-0000000000c2'
 where id in ('94245000-0000-0000-0000-0000000000a1', '94245000-0000-0000-0000-0000000000a2');

select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a1') = 1200,
  'a game moved to another venue takes that venue''s price for the season',
  coalesce(pg_temp.cost('94245000-0000-0000-0000-0000000000a1')::text, 'null'));
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a2') = 1000,
  'unless an admin set its price by hand');

select pg_temp.act_as('42450000-0000-0000-0000-000000000013');
select public.set_game_pitch_cost('94245000-0000-0000-0000-0000000000a2', null);
reset role;
select pg_temp.ok(pg_temp.cost('94245000-0000-0000-0000-0000000000a2') = 1200,
  'an empty correction puts the game back on its venue''s price',
  coalesce(pg_temp.cost('94245000-0000-0000-0000-0000000000a2')::text, 'null'));

-- =============================================================================
-- WHAT EACH SEAT EARNED — one played game, every way of paying
--
--   P1  paid by card, one seat                         180 single
--   P2  paid cash at the pitch, a party of two         360 single
--   P3  a 5-game pass bought for 750                   150 pass
--   P4  a Credit an admin gave                           0 free
--   P5  a card payment refunded as a Credit            180 credit
--   P6  half gift, half refund in the unexpiring pool   90 credit
--   P7  an admin grant recording a bank transfer       180 credit
--   P8  booked cash, not paid yet                      owed 180
--   P9  cancelled in time, refunded                      0
--   P10 cancelled late by card, kept                   180 kept
--   P11 removed by an admin without a refund, on a
--       12-game pass bought for 1800                   150 kept
--   P12 a seed booking                                   0 free
--   + one house guest                                    0
-- =============================================================================

insert into public.games (id, venue, venue_id, starts_at, capacity, price_czk, status,
                          duration_minutes, guest_count) values
  ('94245000-0000-0000-0000-0000000000e1', 'R42P South', '94245000-0000-0000-0000-0000000000c2',
   now() - interval '2 days', 14, 180, 'played', 90, 1);

-- P1 — card
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk, stripe_session_id)
values ('4bb45000-0000-0000-0000-000000000001', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000001', 'confirmed', 'qr', null, 180, 0, 'cs_test_r42p_1');

-- P2 — cash, party of two
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk, guest_count)
values ('4bb45000-0000-0000-0000-000000000002', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000002', 'confirmed', 'cash', null, 360, 0, 1);

-- P3 — a 5-game pass for 750: 900 of Credit
insert into public.credit_topups (id, player_id, amount_czk, payment_code, status,
                                  received_amount_czk, confirmed_at, pass_games)
values ('7b450000-0000-0000-0000-000000000003', '4e450000-0000-0000-0000-000000000003',
        750, 9424500003, 'confirmed', 750, now() - interval '20 days', 5);
insert into public.credit_ledger (id, player_id, delta_czk, reason, created_at, expires_at)
values ('1e450000-0000-0000-0000-000000000003', '4e450000-0000-0000-0000-000000000003', 900,
        'topup', now() - interval '20 days', now() + interval '40 days');

-- P4 — an admin's gift, in the unexpiring pool
insert into public.credit_ledger (player_id, delta_czk, reason, created_at)
values ('4e450000-0000-0000-0000-000000000004', 180, 'admin_grant', now() - interval '10 days');

-- P5 — a refunded card payment: a batch of its own
insert into public.credit_ledger (id, player_id, delta_czk, reason, created_at, expires_at)
values ('1e450000-0000-0000-0000-000000000005', '4e450000-0000-0000-0000-000000000005', 180,
        'cancellation_credit', now() - interval '9 days', now() + interval '51 days');

-- P6 — a gift and a refund in the same pool
insert into public.credit_ledger (player_id, delta_czk, reason, created_at) values
  ('4e450000-0000-0000-0000-000000000006', 180, 'admin_grant',         now() - interval '12 days'),
  ('4e450000-0000-0000-0000-000000000006', 180, 'cancellation_credit', now() - interval '11 days');

-- P7 — a bank transfer recorded as a grant, with the event grant_credit writes
insert into public.credit_ledger (player_id, delta_czk, reason, created_at)
values ('4e450000-0000-0000-0000-000000000007', 180, 'admin_grant', now() - interval '8 days');
insert into public.events (event_type, player_id, metadata, created_at)
values ('payment_unmatched', '4e450000-0000-0000-0000-000000000007',
        jsonb_build_object('amount_czk', 180), now() - interval '8 days');

insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk)
select ('4bb45000-0000-0000-0000-00000000000' || n)::uuid, '94245000-0000-0000-0000-0000000000e1',
       ('4e450000-0000-0000-0000-00000000000' || n)::uuid, 'confirmed', 'credit', null, 180, 180
  from generate_series(3, 7) n;

insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id, created_at) values
  ('4e450000-0000-0000-0000-000000000003', -180, 'redemption', '4bb45000-0000-0000-0000-000000000003',
   '1e450000-0000-0000-0000-000000000003', now() - interval '3 days'),
  ('4e450000-0000-0000-0000-000000000004', -180, 'redemption', '4bb45000-0000-0000-0000-000000000004',
   null, now() - interval '3 days'),
  ('4e450000-0000-0000-0000-000000000005', -180, 'redemption', '4bb45000-0000-0000-0000-000000000005',
   '1e450000-0000-0000-0000-000000000005', now() - interval '3 days'),
  ('4e450000-0000-0000-0000-000000000006', -180, 'redemption', '4bb45000-0000-0000-0000-000000000006',
   null, now() - interval '3 days'),
  ('4e450000-0000-0000-0000-000000000007', -180, 'redemption', '4bb45000-0000-0000-0000-000000000007',
   null, now() - interval '3 days');

-- P8 — booked to pay cash, not paid
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk)
values ('4bb45000-0000-0000-0000-000000000008', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000008', 'reserved', 'cash', null, 180, 0);

-- P9 — cancelled in time: refunded in full
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk, stripe_session_id)
values ('4bb45000-0000-0000-0000-000000000009', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000009', 'cancelled', 'qr', null, 180, 0, 'cs_test_r42p_9');
insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, created_at, expires_at)
values ('4e450000-0000-0000-0000-000000000009', 180, 'cancellation_credit',
        '4bb45000-0000-0000-0000-000000000009', now() - interval '4 days', now() + interval '56 days');
insert into public.events (event_type, player_id, game_id, booking_id, metadata)
values ('booking_cancelled', '4e450000-0000-0000-0000-000000000009', '94245000-0000-0000-0000-0000000000e1',
        '4bb45000-0000-0000-0000-000000000009',
        jsonb_build_object('credit_issued_czk', 180, 'forfeited_czk', 0, 'previous_status', 'confirmed'));

-- P10 — cancelled late, paid by card: the money stays
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk, stripe_session_id)
values ('4bb45000-0000-0000-0000-000000000010', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000010', 'cancelled', 'qr', null, 180, 0, 'cs_test_r42p_10');
insert into public.events (event_type, player_id, game_id, booking_id, metadata)
values ('booking_cancelled', '4e450000-0000-0000-0000-000000000010', '94245000-0000-0000-0000-0000000000e1',
        '4bb45000-0000-0000-0000-000000000010',
        jsonb_build_object('credit_issued_czk', 0, 'forfeited_czk', 180, 'previous_status', 'confirmed'));

-- P11 — on a 12-game pass for 1800, removed by an admin who returned nothing
insert into public.credit_topups (id, player_id, amount_czk, payment_code, status,
                                  received_amount_czk, confirmed_at, pass_games)
values ('7b450000-0000-0000-0000-000000000011', '4e450000-0000-0000-0000-000000000011',
        1800, 9424500011, 'confirmed', 1800, now() - interval '25 days', 12);
insert into public.credit_ledger (id, player_id, delta_czk, reason, created_at, expires_at)
values ('1e450000-0000-0000-0000-000000000011', '4e450000-0000-0000-0000-000000000011', 2160,
        'topup', now() - interval '25 days', now() + interval '35 days');
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk)
values ('4bb45000-0000-0000-0000-000000000011', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000011', 'cancelled', 'credit', null, 180, 180);
insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id, created_at)
values ('4e450000-0000-0000-0000-000000000011', -180, 'redemption', '4bb45000-0000-0000-0000-000000000011',
        '1e450000-0000-0000-0000-000000000011', now() - interval '5 days');
insert into public.events (event_type, player_id, game_id, booking_id, metadata)
values ('admin_booking_removed', '4e450000-0000-0000-0000-000000000011', '94245000-0000-0000-0000-0000000000e1',
        '4bb45000-0000-0000-0000-000000000011',
        jsonb_build_object('credit_issued_czk', 0, 'credit_returned', false, 'withheld_czk', 180));

-- P12 — a seed booking
insert into public.bookings (id, game_id, player_id, status, payment_method, payment_code,
                             price_czk, credit_applied_czk)
values ('4bb45000-0000-0000-0000-000000000012', '94245000-0000-0000-0000-0000000000e1',
        '4e450000-0000-0000-0000-000000000012', 'confirmed', 'seed_free', null, 0, 0);

-- --- reading it back ---------------------------------------------------------

create temp table _e on commit drop as
select * from public.game_economics(array['94245000-0000-0000-0000-0000000000e1'::uuid]);

select pg_temp.ok((select count(*) from _e) = 1, 'one row for the game asked about');

select pg_temp.ok((select seats_taken = 11 from _e),
  'eleven seats taken — eight paid or free bookings, a party guest, the unpaid one, the house guest',
  (select seats_taken::text from _e));
select pg_temp.ok((select house_guests = 1 and unpaid_seats = 1 from _e),
  'the house guest and the unpaid seat are counted apart',
  (select house_guests || ' house, ' || unpaid_seats || ' unpaid' from _e));

select pg_temp.ok((select single_seats = 3 and single_czk = 540 from _e),
  'single games: three seats, 540 — card and cash at the game''s own price',
  (select single_seats || ' seats, ' || single_czk from _e));
select pg_temp.ok((select pass_seats = 1 and pass_czk = 150 from _e),
  'a pass seat is worth the pass price over its games: 750 / 5 = 150, not 180',
  (select pass_seats || ' seats, ' || pass_czk from _e));
select pg_temp.ok((select credit_seats = 2.5 and credit_czk = 450 from _e),
  'balance Credits at what was paid: a refund 180, half a gift 90, a recorded transfer 180',
  (select credit_seats || ' seats, ' || credit_czk from _e));
select pg_temp.ok((select free_seats = 2.5 from _e),
  'free seats: the gift, the gifted half, the seed booking',
  (select free_seats::text from _e));
select pg_temp.ok((select kept_czk = 330 from _e),
  'kept from late cancellations: 180 by card plus a pass seat worth 150; the refund keeps nothing',
  (select kept_czk::text from _e));
select pg_temp.ok((select owed_czk = 180 from _e),
  'the unpaid cash booking is owed, not earned', (select owed_czk::text from _e));

select pg_temp.ok((select revenue_czk = 1470 from _e),
  'revenue: 540 + 150 + 450 + 330 = 1470', (select revenue_czk::text from _e));
select pg_temp.ok((select pitch_cost_czk = 1200 from _e),
  'the pitch cost is the winter price of the venue it was played at',
  (select coalesce(pitch_cost_czk::text, 'null') from _e));
select pg_temp.ok((select profit_czk = 270 from _e),
  'profit: 1470 − 1200 = 270', (select coalesce(profit_czk::text, 'null') from _e));
select pg_temp.ok((select break_even_seats = 7 from _e),
  'break-even: 1200 / 180 rounded up is seven seats',
  (select coalesce(break_even_seats::text, 'null') from _e));

select pg_temp.ok(
  (select pitch_cost_czk is null and profit_czk is null and break_even_seats is null
     from public.game_economics(array['94245000-0000-0000-0000-0000000000a0'::uuid])),
  'a game with no pitch cost has no profit and no break-even, rather than a fake one');

select pg_temp.ok(
  (select count(*) from public.game_economics(array[]::uuid[])) = 0,
  'asking about no games returns nothing');

select pg_temp.ok(
  (public.app_capabilities() ->> 'pitchCosts')::boolean,
  'app_capabilities reports pitchCosts');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
