-- =============================================================================
-- ROUND 34, ITEM 4 — cancelling guests, drilled.
--
-- Run:  node supabase/tests/run.mjs cancel_guests
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

-- EVERY ASSERTION HERE MOVES MONEY. It books parties, removes guests, reads the
-- ledger and checks what a late removal forfeits. None of that belongs in a
-- migration's verification block; `run.mjs` rolls the whole file back.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000c1', 'cg-a@test.invalid'),
  ('60000000-0000-0000-0000-0000000000c2', 'cg-b@test.invalid'),
  ('60000000-0000-0000-0000-0000000000c3', 'cg-c@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('6ccc0000-0000-0000-0000-0000000000c1', 'GuestCancelA', 'cg-a@test.invalid',
   '60000000-0000-0000-0000-0000000000c1'),
  ('6ccc0000-0000-0000-0000-0000000000c2', 'GuestCancelB', 'cg-b@test.invalid',
   '60000000-0000-0000-0000-0000000000c2'),
  ('6ccc0000-0000-0000-0000-0000000000c3', 'GuestCancelC', 'cg-c@test.invalid',
   '60000000-0000-0000-0000-0000000000c3');

-- ONE GAME WELL INSIDE THE WINDOW AND ONE WELL OUTSIDE IT. The cutoff is eight
-- hours, so seven hours is late and thirty is not; nothing here depends on the
-- test running at a particular time of day.
insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('96660000-0000-0000-0000-0000000000c1', 'Guest Cancel Early', now() + interval '30 hours', 12, 150, 'published'),
  ('96660000-0000-0000-0000-0000000000c2', 'Guest Cancel Late',  now() + interval '7 hours',  12, 150, 'published'),
  ('96660000-0000-0000-0000-0000000000c3', 'Guest Cancel Full',  now() + interval '30 hours',  4, 150, 'published');

create function pg_temp.booking_of(p_game uuid, p_player uuid)
returns uuid language sql security definer as $$
  select id from public.bookings
   where game_id = p_game and player_id = p_player
     and status in ('reserved', 'confirmed')
   limit 1
$$;

create function pg_temp.booking_row(p_id uuid)
returns public.bookings language sql security definer as $$
  select * from public.bookings where id = p_id
$$;

create function pg_temp.balance(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

-- =============================================================================
-- inside the window — three guests go on, two come off, and the money follows
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c1');
select public.create_booking('96660000-0000-0000-0000-0000000000c1', 'cash', null, null, 3);
reset role;

-- Paid, so the refund is the price share rather than the applied credit. Written
-- at the top level: service_role deliberately has no UPDATE on bookings.
update public.bookings set status = 'confirmed'
 where id = pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                               '6ccc0000-0000-0000-0000-0000000000c1');

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1') = 4,
  'a party of four holds four seats before anything is removed',
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1')::text);

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(
  (public.cancel_guests(
     pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                        '6ccc0000-0000-0000-0000-0000000000c1'), 2)).credit_issued_czk = 300,
  'removing two guests from a 600 CZK party of four returns exactly 2 x 150');
reset role;

select pg_temp.ok(
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
     '6ccc0000-0000-0000-0000-0000000000c1'))).guest_count = 1,
  'the booking keeps one guest');

select pg_temp.ok(
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
     '6ccc0000-0000-0000-0000-0000000000c1'))).price_czk = 300,
  'and its price is what the two remaining seats are worth — refund plus '
  'remainder is exactly the original',
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
     '6ccc0000-0000-0000-0000-0000000000c1'))).price_czk::text);

select pg_temp.ok(
  pg_temp.balance('6ccc0000-0000-0000-0000-0000000000c1') = 300,
  'the credit is in the ledger, not merely in the return value',
  pg_temp.balance('6ccc0000-0000-0000-0000-0000000000c1')::text);

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1') = 2,
  'AND THE SEATS ARE FREE IMMEDIATELY — two of them',
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1')::text);

-- THE SAME MACHINERY, ASSERTED AS THE SAME EVENT. The waitlist reads
-- `spot_released`; emitting something that MEANS the same would not fire it.
select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'spot_released'
      and game_id = '96660000-0000-0000-0000-0000000000c1') = 1,
  'a guest removal releases a spot, exactly as a cancellation does');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'booking_guests_removed'
      and game_id = '96660000-0000-0000-0000-0000000000c1'
      and (metadata ->> 'removed')::int = 2
      and (metadata ->> 'remaining')::int = 1
      and (metadata ->> 'forfeited_czk')::int = 0) = 1,
  'and is logged with what went and what is left');

-- =============================================================================
-- IT NEVER TOUCHES THE PLAYER'S OWN SEAT
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c1');
select pg_temp.ok_probe(
  format($q$select public.cancel_guests(%L, 2)$q$,
         pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                            '6ccc0000-0000-0000-0000-0000000000c1')),
  'raise:INVALID_GUEST_COUNT',
  'asking for more guests than the booking holds is refused — the count can '
  'reach zero and cannot reach the player''s own seat');

select pg_temp.ok_probe(
  format($q$select public.cancel_guests(%L, 0)$q$,
         pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                            '6ccc0000-0000-0000-0000-0000000000c1')),
  'raise:INVALID_GUEST_COUNT', 'and so is removing nobody');

select pg_temp.ok_probe(
  format($q$select public.cancel_guests(%L, -1)$q$,
         pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                            '6ccc0000-0000-0000-0000-0000000000c1')),
  'raise:INVALID_GUEST_COUNT', 'and so is a negative count');

-- The last guest comes off, and the booking survives at one seat.
select pg_temp.ok(
  (public.cancel_guests(
     pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
                        '6ccc0000-0000-0000-0000-0000000000c1'), 1)).guests_remaining = 0,
  'the last guest can be removed');
reset role;

select pg_temp.ok(
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c1',
     '6ccc0000-0000-0000-0000-0000000000c1'))).status = 'confirmed',
  'and the PLAYER IS STILL IN — removing every guest is not a cancellation');

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1') = 1,
  'one seat, theirs',
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c1')::text);

-- =============================================================================
-- OUTSIDE the window — the seat goes, the money stays, and the log says so
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c2');
select public.create_booking('96660000-0000-0000-0000-0000000000c2', 'cash', null, null, 2);
reset role;

update public.bookings set status = 'confirmed'
 where id = pg_temp.booking_of('96660000-0000-0000-0000-0000000000c2',
                               '6ccc0000-0000-0000-0000-0000000000c2');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c2');
select pg_temp.ok(
  (public.cancel_guests(
     pg_temp.booking_of('96660000-0000-0000-0000-0000000000c2',
                        '6ccc0000-0000-0000-0000-0000000000c2'), 1)).credit_issued_czk = 0,
  'seven hours out, a removed guest refunds nothing');
reset role;

select pg_temp.ok(
  pg_temp.balance('6ccc0000-0000-0000-0000-0000000000c2') = 0,
  'and no ledger row was written',
  pg_temp.balance('6ccc0000-0000-0000-0000-0000000000c2')::text);

select pg_temp.ok(
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c2',
     '6ccc0000-0000-0000-0000-0000000000c2'))).price_czk = 450,
  'THE PRICE IS UNTOUCHED — the record of what was paid is the only thing that '
  'can answer a question about this booking later',
  (pg_temp.booking_row(pg_temp.booking_of('96660000-0000-0000-0000-0000000000c2',
     '6ccc0000-0000-0000-0000-0000000000c2'))).price_czk::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'booking_guests_removed'
      and game_id = '96660000-0000-0000-0000-0000000000c2'
      and (metadata ->> 'forfeited_czk')::int = 150
      and (metadata ->> 'credit_issued_czk')::int = 0) = 1,
  'and the event records the forfeit, which is the whole audit trail for a '
  'late removal');

select pg_temp.ok(
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c2') = 2,
  'the seat is freed anyway — late is still worth more to everyone else than '
  'silence',
  public.game_seats_taken('96660000-0000-0000-0000-0000000000c2')::text);

-- =============================================================================
-- authorization lives INSIDE the function, where curl meets it
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c3');
select pg_temp.ok_probe(
  format($q$select public.cancel_guests(%L, 1)$q$,
         pg_temp.booking_of('96660000-0000-0000-0000-0000000000c2',
                            '6ccc0000-0000-0000-0000-0000000000c2')),
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot remove guests from somebody else''s booking');

select pg_temp.ok_probe(
  $q$select public.cancel_guests('00000000-0000-0000-0000-000000000000', 1)$q$,
  'raise:BOOKING_NOT_FOUND', 'an unknown booking raises');
reset role;

-- =============================================================================
-- A FULL GAME COMES BACK OPEN, which is what the waitlist is waiting for
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c3');
select public.create_booking('96660000-0000-0000-0000-0000000000c3', 'cash', null, null, 3);
reset role;

select pg_temp.ok(
  (select status from public.games where id = '96660000-0000-0000-0000-0000000000c3') = 'full',
  'a party that exactly fills a pitch flips it to full');

update public.bookings set status = 'confirmed'
 where id = pg_temp.booking_of('96660000-0000-0000-0000-0000000000c3',
                               '6ccc0000-0000-0000-0000-0000000000c3');

select pg_temp.act_as('60000000-0000-0000-0000-0000000000c3');
select public.cancel_guests(
  pg_temp.booking_of('96660000-0000-0000-0000-0000000000c3',
                     '6ccc0000-0000-0000-0000-0000000000c3'), 1);
reset role;

select pg_temp.ok(
  (select status from public.games where id = '96660000-0000-0000-0000-0000000000c3') = 'published',
  'and removing one guest puts it back to published — sync_game_fullness ran',
  (select status::text from public.games where id = '96660000-0000-0000-0000-0000000000c3'));

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
