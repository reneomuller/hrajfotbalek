-- =============================================================================
-- ROUND 33, ITEM 3 — a party of up to thirteen, drilled.
--
-- Run:  node supabase/tests/run.mjs party_size
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

-- EVERY ASSERTION HERE BOOKS SOMETHING. That is why it is not in the migration:
-- a verification block that made a party of thirteen against production would
-- leave thirteen seats sold on a real game. `run.mjs` rolls this back.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000d1', 'ps-a@test.invalid'),
  ('60000000-0000-0000-0000-0000000000d2', 'ps-b@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6ddd0000-0000-0000-0000-0000000000d1', 'PartyA', 'ps-a@test.invalid',
   '60000000-0000-0000-0000-0000000000d1', false),
  ('6ddd0000-0000-0000-0000-0000000000d2', 'PartyB', 'ps-b@test.invalid',
   '60000000-0000-0000-0000-0000000000d2', false);

-- Capacity 20 so the POLICY is the binding constraint rather than the pitch —
-- the two are tested separately below, and a game that cannot seat fourteen
-- would prove nothing about the ceiling.
insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('96660000-0000-0000-0000-0000000000d1', 'Party Cap Twenty', now() + interval '7 days', 20, 150, 'published'),
  ('96660000-0000-0000-0000-0000000000d2', 'Party Cap Six',    now() + interval '8 days',  6, 150, 'published');

-- =============================================================================
-- the ceiling is one value, and both readers read it
-- =============================================================================

select pg_temp.ok(
  public.max_party_guests() = 13,
  'max_party_guests() is thirteen',
  public.max_party_guests()::text);

select pg_temp.ok(
  (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_booking_internal')
    like '%max_party_guests()%',
  'create_booking_internal reads the function rather than a literal');

select pg_temp.ok(
  (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_add_guests')
    like '%max_party_guests()%',
  'and so does can_add_guests — the two cannot drift apart again');

-- =============================================================================
-- thirteen is accepted; fourteen is not
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000d1');

select pg_temp.ok(
  (select (public.create_booking(
     '96660000-0000-0000-0000-0000000000d1', 'cash', null, null, 13)).price_czk)
   = 150 * 14,
  'a party of thirteen guests is booked, and priced at fourteen seats');

reset role;

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000d1') = 14,
  'and the seat count is the whole party — the booker plus thirteen',
  public.game_seats_taken('96660000-0000-0000-0000-0000000000d1')::text);

select pg_temp.act_as('60000000-0000-0000-0000-0000000000d2');
select pg_temp.ok_probe(
  $q$select public.create_booking(
       '96660000-0000-0000-0000-0000000000d1', 'cash', null, null, 14)$q$,
  'raise:PARTY_TOO_LARGE',
  'fourteen is refused — the ceiling is enforced INSIDE the function, where '
  'curl meets it');
reset role;

-- =============================================================================
-- CAPACITY STILL BINDS FIRST, which is the half a bigger ceiling could break
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000d2');
select pg_temp.ok_probe(
  $q$select public.create_booking(
       '96660000-0000-0000-0000-0000000000d2', 'cash', null, null, 10)$q$,
  'raise:CAPACITY_FULL',
  'a party the policy allows but the pitch cannot seat is refused for the '
  'pitch, not for the policy');
reset role;

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000d2') = 0,
  'and nothing was half-booked on the way to that refusal');

-- =============================================================================
-- can_add_guests counts ACROSS the guests a booking already holds
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000d2');
select public.create_booking('96660000-0000-0000-0000-0000000000d2', 'cash', null, null, 1);
reset role;

create function pg_temp.booking_of(p_game uuid, p_player uuid)
returns uuid language sql security definer as $$
  select id from public.bookings
   where game_id = p_game and player_id = p_player
     and status in ('reserved', 'confirmed')
   limit 1
$$;

-- PAID, BECAUSE `can_add_guests` ANSWERS 0 FOR ANYTHING ELSE. Under pay-first a
-- `reserved` row is somebody who has not settled, and selling them a second
-- thing is what that check exists to prevent. Written at the top level rather
-- than as service_role: `service_role` deliberately has no UPDATE on
-- `bookings`, which the E2E suite discovered the hard way.
update public.bookings set status = 'confirmed'
 where id = pg_temp.booking_of('96660000-0000-0000-0000-0000000000d2',
                               '6ddd0000-0000-0000-0000-0000000000d2');

-- The game seats six and this booking holds two of them, so four are free —
-- fewer than the thirteen the policy would otherwise allow.
select pg_temp.act_as('60000000-0000-0000-0000-0000000000d2');
select pg_temp.ok(
  public.can_add_guests(pg_temp.booking_of(
    '96660000-0000-0000-0000-0000000000d2', '6ddd0000-0000-0000-0000-0000000000d2')) = 4,
  'the panel is offered the FREE SEATS when the pitch is the tighter bound',
  public.can_add_guests(pg_temp.booking_of(
    '96660000-0000-0000-0000-0000000000d2', '6ddd0000-0000-0000-0000-0000000000d2'))::text);
reset role;

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
