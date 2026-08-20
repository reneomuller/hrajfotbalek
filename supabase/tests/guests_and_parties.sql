-- =============================================================================
-- Round 11 assertions — house guests, party bookings, and the seat count
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/guests_and_parties.sql
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- THE PROPERTY UNDER TEST IS ARITHMETIC, and it is the one thing about this
-- feature that can be wrong without looking wrong: a game whose seats are
-- miscounted still renders, still books, and simply admits one player too many
-- or refuses one too early. So every assertion here is a number, and the
-- capacity refusals are asserted by their named error rather than by "it
-- failed" — CAPACITY_FULL and PARTY_TOO_LARGE mean different things to the UI.
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

-- Returns rows:N | denied | raise:<message> | error:<sqlstate>. `_p::text`
-- rather than `count(*)`: the planner prunes a non-volatile call out of a
-- count(*) plan and the probe reports a false pass. Same reasoning as
-- booking_create.sql, which hit this first.
create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000061', 'g-a@test.invalid'),
  ('60000000-0000-0000-0000-000000000062', 'g-b@test.invalid'),
  ('60000000-0000-0000-0000-000000000063', 'g-c@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6aaa0000-0000-0000-0000-00000000000a', 'GstPlayerA', 'g-a@test.invalid', '60000000-0000-0000-0000-000000000061', false),
  ('6bbb0000-0000-0000-0000-00000000000b', 'GstPlayerB', 'g-b@test.invalid', '60000000-0000-0000-0000-000000000062', false),
  ('6ddd0000-0000-0000-0000-00000000000d', 'GstAdminD',  'g-c@test.invalid', '60000000-0000-0000-0000-000000000063', true),
  -- A pre-round-11 shadow player. Nothing about this row changes; the point of
  -- the assertion below is that it now RENDERS as a guest without a backfill.
  ('6eee0000-0000-0000-0000-00000000000e', 'GstShadowE', null, null, false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('96660000-0000-0000-0000-000000000001', 'Guest Cap Six', now() + interval '7 days', 6, 150, 'published'),
  ('96660000-0000-0000-0000-000000000002', 'Guest Cap Two', now() + interval '8 days', 2, 150, 'published'),
  ('96660000-0000-0000-0000-000000000003', 'Guest Settled', now() + interval '9 days', 6, 150, 'published');

-- =============================================================================
-- game_seats_taken — the single definition
-- =============================================================================

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 0,
  'an empty game has taken no seats');

-- --- a party of three, on one booking ----------------------------------------
select pg_temp.act_as('60000000-0000-0000-0000-000000000061');

select pg_temp.ok(
  (select (public.create_booking(
     '96660000-0000-0000-0000-000000000001', 'cash', null, null, 2)).price_czk) = 450,
  'a party of three is priced at three times the game price, on one booking');

reset role;

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 3,
  'a booking with two guests consumes three seats');

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '96660000-0000-0000-0000-000000000001'
      and status in ('reserved', 'confirmed')) = 1,
  'the party is ONE booking, not three');

select pg_temp.ok(
  (select guest_count from public.bookings
    where game_id = '96660000-0000-0000-0000-000000000001'
      and player_id = '6aaa0000-0000-0000-0000-00000000000a') = 2,
  'the guests are recorded on the booking that carries them');

-- =============================================================================
-- house guests
-- =============================================================================

select pg_temp.act_as_service();

select pg_temp.ok(
  public.set_game_guests('96660000-0000-0000-0000-000000000001', 2) = 2,
  'an admin may hold house guests on a game');

reset role;

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 5,
  'house guests are counted alongside the bookings');

-- Removal is a DECREMENT, because house guests are interchangeable: there is
-- nothing about "Guest 2" that differs from "Guest 3".
select pg_temp.act_as_service();
select pg_temp.ok(
  public.set_game_guests('96660000-0000-0000-0000-000000000001', 1) = 1,
  'removing a house guest is a decrement');
reset role;

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 4,
  'the seat count follows the decrement');

-- --- authorization ------------------------------------------------------------
select pg_temp.act_as('60000000-0000-0000-0000-000000000061');

select pg_temp.ok_probe(
  $$select public.set_game_guests('96660000-0000-0000-0000-000000000001', 5)$$,
  'raise:INSUFFICIENT_PERMISSION',
  'an ordinary player cannot hold house guests');

reset role;

-- --- house guests cannot oversubscribe ---------------------------------------
select pg_temp.act_as_service();

-- Four seats are taken of six; asking for four house guests needs seven.
select pg_temp.ok_probe(
  $$select public.set_game_guests('96660000-0000-0000-0000-000000000001', 4)$$,
  'raise:CAPACITY_FULL',
  'house guests cannot be raised past what the pitch holds');

reset role;

-- =============================================================================
-- capacity is counted in SEATS
-- =============================================================================

-- Two seats free on the cap-six game. A party of three does not fit, and the
-- whole party is refused rather than partly seated.
select pg_temp.act_as('60000000-0000-0000-0000-000000000062');

select pg_temp.ok_probe(
  $$select public.create_booking('96660000-0000-0000-0000-000000000001', 'cash', null, null, 2)$$,
  'raise:CAPACITY_FULL',
  'a party larger than the space left is refused whole');

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 4,
  'a refused party seats nobody');

-- ...and a party that exactly fills the game is accepted, and flips it to full.
select pg_temp.ok(
  (select (public.create_booking(
     '96660000-0000-0000-0000-000000000001', 'cash', null, null, 1)).id) is not null,
  'a party that exactly fits is accepted');

reset role;

select pg_temp.ok(
  (select status from public.games where id = '96660000-0000-0000-0000-000000000001') = 'full',
  'the last seat of a party flips the game to full');

-- --- the ceiling --------------------------------------------------------------
select pg_temp.act_as('60000000-0000-0000-0000-000000000061');

select pg_temp.ok_probe(
  $$select public.create_booking('96660000-0000-0000-0000-000000000002', 'cash', null, null, 4)$$,
  'raise:PARTY_TOO_LARGE',
  'a party larger than the policy ceiling is refused as oversize, not as full');

select pg_temp.ok_probe(
  $$select public.create_booking('96660000-0000-0000-0000-000000000002', 'cash', null, null, -1)$$,
  'raise:INVALID_GUEST_COUNT',
  'a negative party is refused');

reset role;

-- =============================================================================
-- capacity may not be cut below the seats already owed
-- =============================================================================

select pg_temp.act_as_service();

select pg_temp.ok_probe(
  $$select public.set_game_capacity('96660000-0000-0000-0000-000000000001', 3)$$,
  'raise:CAPACITY_BELOW_ACTIVE_BOOKINGS',
  'a game cannot be shrunk below the seats its parties and guests hold');

reset role;

-- =============================================================================
-- cancellation releases the WHOLE party
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-000000000061');

select pg_temp.ok(
  (select (public.cancel_booking(
     (select id from public.bookings
       where game_id = '96660000-0000-0000-0000-000000000001'
         and player_id = '6aaa0000-0000-0000-0000-00000000000a'
         and status in ('reserved', 'confirmed')))).status) = 'cancelled',
  'the party booking cancels');

reset role;

-- Three seats went back: the player's and both guests'. One booking, three
-- spots — this is the assertion that fails if a later edit counts bookings
-- again instead of seats.
select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-000000000001') = 3,
  'cancelling a party of three releases all three seats');

select pg_temp.ok(
  (select status from public.games where id = '96660000-0000-0000-0000-000000000001') = 'published',
  'releasing the party brings the game back from full');

-- =============================================================================
-- the roster view: one row per seat
-- =============================================================================

insert into public.bookings (game_id, player_id, status, payment_method, price_czk, guest_count)
values ('96660000-0000-0000-0000-000000000003', '6aaa0000-0000-0000-0000-00000000000a',
        'confirmed', 'cash', 450, 2),
       -- The pre-round-11 shadow, booked the way one always was.
       ('96660000-0000-0000-0000-000000000003', '6eee0000-0000-0000-0000-00000000000e',
        'confirmed', 'cash', 150, 0);

update public.games set guest_count = 2
 where id = '96660000-0000-0000-0000-000000000003';

set role anon;

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003') = 6,
  'the roster emits one row per seat: 1 player + 2 party + 1 shadow + 2 house');

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003' and not is_guest) = 1,
  'exactly one of those seven is a real signed-up player');

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003'
      and guest_of = 'GstPlayerA') = 2,
  'both party guests name the player who brought them');

select pg_temp.ok(
  (select bool_and(nickname is null) from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003' and guest_of is not null),
  'a party guest carries NO nickname, so it can never match the viewer''s own');

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003'
      and is_guest and guest_of is null and guest_index is not null) = 2,
  'the two house guests are anonymous and numbered');

-- THE NO-BACKFILL ASSERTION. A shadow player was a guest all along; nothing
-- about its row changed and it renders under its own name.
select pg_temp.ok(
  (select is_guest from public.game_roster_public
    where game_id = '96660000-0000-0000-0000-000000000003'
      and nickname = 'GstShadowE'),
  'a pre-round-11 shadow player renders as a guest, keeping its own name');

-- --- the PII boundary is unchanged --------------------------------------------

select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
       and column_name in ('status', 'player_id', 'email', 'phone')),
  'the widened roster view still publishes no status, id, email or phone');

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
