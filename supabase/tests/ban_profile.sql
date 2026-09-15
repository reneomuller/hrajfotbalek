-- =============================================================================
-- ROUND 35 v2, ITEM 8 — banning a profile, drilled.
--
-- Run:  node supabase/tests/run.mjs ban_profile
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

-- IT BANS PEOPLE, CANCELS THEIR SEATS AND BLOCKS A SIGNUP. Every line of it
-- writes; `run.mjs` rolls the whole file back.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000b1', 'ban-a@test.invalid'),
  ('60000000-0000-0000-0000-0000000000b2', 'ban-b@test.invalid'),
  ('60000000-0000-0000-0000-0000000000b3', 'ban-c@test.invalid'),
  ('60000000-0000-0000-0000-0000000000b4', 'ban-d@test.invalid');

insert into public.players (id, nickname, email, phone, auth_user_id, is_admin) values
  ('6bbb0000-0000-0000-0000-0000000000b1', 'BanAdmin',  'ban-a@test.invalid', null,          '60000000-0000-0000-0000-0000000000b1', true),
  ('6bbb0000-0000-0000-0000-0000000000b2', 'BanTarget', 'ban-b@test.invalid', '+420777000111', '60000000-0000-0000-0000-0000000000b2', false),
  ('6bbb0000-0000-0000-0000-0000000000b3', 'BanBystander', 'ban-c@test.invalid', '+420777000222', '60000000-0000-0000-0000-0000000000b3', false),
  ('6bbb0000-0000-0000-0000-0000000000b4', 'BanOther',  'ban-d@test.invalid', null,          '60000000-0000-0000-0000-0000000000b4', false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9bbb0000-0000-0000-0000-0000000000b1', 'Ban Future', now() + interval '30 hours', 12, 180, 'published'),
  ('9bbb0000-0000-0000-0000-0000000000b2', 'Ban Past',   now() - interval '30 hours', 12, 180, 'played');

create function pg_temp.seats(p uuid) returns integer language sql security definer as $$
  select public.game_seats_taken(p)
$$;

create function pg_temp.banned(p uuid) returns boolean language sql security definer as $$
  select banned_at is not null from public.players where id = p
$$;

create function pg_temp.status_of(p_game uuid, p_player uuid) returns text
language sql security definer as $$
  select status::text from public.bookings where game_id = p_game and player_id = p_player limit 1
$$;

-- A future booking with a guest, and a past one that must survive.
select pg_temp.act_as('60000000-0000-0000-0000-0000000000b2');
select public.create_booking('9bbb0000-0000-0000-0000-0000000000b1', 'cash', null, null, 1);
reset role;

insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
values ('9bbb0000-0000-0000-0000-0000000000b2', '6bbb0000-0000-0000-0000-0000000000b2',
        'confirmed', 'cash', 180);

select pg_temp.ok(
  pg_temp.seats('9bbb0000-0000-0000-0000-0000000000b1') = 2,
  'the future game holds the player and their guest before the ban',
  pg_temp.seats('9bbb0000-0000-0000-0000-0000000000b1')::text);

-- =============================================================================
-- authorization
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b3');
select pg_temp.ok_probe(
  $q$select public.ban_player('6bbb0000-0000-0000-0000-0000000000b2')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot ban another player');
reset role;

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b1');
select pg_temp.ok_probe(
  $q$select public.ban_player('6bbb0000-0000-0000-0000-0000000000b1')$q$,
  'raise:CANNOT_BAN_ADMIN',
  'AN ADMIN CANNOT BE BANNED — a product that can lock every organizer out of '
  'its own panel has a failure mode with no way back');

-- =============================================================================
-- the ban does three things at once
-- =============================================================================

select pg_temp.ok(
  public.ban_player('6bbb0000-0000-0000-0000-0000000000b2') = 1,
  'the ban cancels the one FUTURE booking and says so');
reset role;

select pg_temp.ok(
  pg_temp.banned('6bbb0000-0000-0000-0000-0000000000b2'),
  '(a) the account is banned');

select pg_temp.ok(
  public.is_phone_banned('+420777000111'),
  '(b) and so is the phone number');

select pg_temp.ok(
  pg_temp.status_of('9bbb0000-0000-0000-0000-0000000000b1',
                    '6bbb0000-0000-0000-0000-0000000000b2') = 'cancelled',
  '(c) the future booking is cancelled');

select pg_temp.ok(
  pg_temp.seats('9bbb0000-0000-0000-0000-0000000000b1') = 0,
  'and BOTH seats are free — the guest went with the booking',
  pg_temp.seats('9bbb0000-0000-0000-0000-0000000000b1')::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'spot_released'
      and game_id = '9bbb0000-0000-0000-0000-0000000000b1') = 1,
  'the SAME release event any cancellation emits — so the same waitlist '
  'machinery fires');

select pg_temp.ok(
  pg_temp.status_of('9bbb0000-0000-0000-0000-0000000000b2',
                    '6bbb0000-0000-0000-0000-0000000000b2') = 'confirmed',
  'THE PAST GAME KEEPS ITS ROSTER — history is not a punishment, and removing '
  'it would rewrite everybody else''s stats');

-- =============================================================================
-- a banned player cannot act, anywhere
--
-- ASSERTED THROUGH `create_booking` RATHER THAN THROUGH A FLAG, because the
-- claim is not "a column is set" — it is that every state transition refuses.
-- `current_player_id()` is the chokepoint they all go through.
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b2');
select pg_temp.ok(
  public.current_player_id() is null,
  'a banned session resolves to no player');

select pg_temp.ok_probe(
  $q$select public.create_booking('9bbb0000-0000-0000-0000-0000000000b1', 'cash')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'and cannot book');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'player_banned'
      and player_id = '6bbb0000-0000-0000-0000-0000000000b2'
      and (metadata ->> 'bookings_cancelled')::int = 1) = 1,
  'the ban is logged with what it cost');

-- THE CREDITS ARE FROZEN, NOT TAKEN.
select pg_temp.ok(
  not exists (select 1 from public.credit_ledger
               where player_id = '6bbb0000-0000-0000-0000-0000000000b2'
                 and reason = 'cancellation_credit'),
  'nothing was refunded and nothing was confiscated — the ledger is untouched');

-- =============================================================================
-- the number is refused at signup
-- =============================================================================

select pg_temp.ok(
  public.is_phone_banned('+420777000222') = false,
  'a bystander''s number is NOT banned');

select pg_temp.ok(
  public.is_phone_banned('  +420777000111  '),
  'and the check trims, so whitespace is not a way around it');

-- =============================================================================
-- unban is the reverse toggle, and deliberately not a full undo
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b1');
select public.unban_player('6bbb0000-0000-0000-0000-0000000000b2');
reset role;

select pg_temp.ok(
  not pg_temp.banned('6bbb0000-0000-0000-0000-0000000000b2'),
  'unbanning restores the account');

select pg_temp.ok(
  public.is_phone_banned('+420777000111') = false,
  'and frees the number');

select pg_temp.ok(
  pg_temp.status_of('9bbb0000-0000-0000-0000-0000000000b1',
                    '6bbb0000-0000-0000-0000-0000000000b2') = 'cancelled',
  'THE CANCELLED BOOKING STAYS CANCELLED — its seat was released and somebody '
  'else may be sitting in it');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b2');
select pg_temp.ok(
  public.current_player_id() is not null,
  'and the player can act again');
reset role;

-- =============================================================================
-- both directions are idempotent
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(
  public.ban_player('6bbb0000-0000-0000-0000-0000000000b4') = 0,
  'banning somebody with no bookings cancels nothing');
select pg_temp.ok(
  public.ban_player('6bbb0000-0000-0000-0000-0000000000b4') = 0,
  'and banning them twice is a no-op');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'player_banned'
      and player_id = '6bbb0000-0000-0000-0000-0000000000b4') = 1,
  'which writes no second event — a log that records non-events cannot be counted');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
