-- =============================================================================
-- Phase 19 assertions — notify_waitlist
--
-- Run:  node supabase/tests/run.mjs notify_waitlist
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
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000ab01', 'n1@test.invalid'),
  ('b0000000-0000-0000-0000-00000000ab02', 'n2@test.invalid'),
  ('c0000000-0000-0000-0000-00000000ab03', 'n3@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000ab01', 'NotifyOne',   'n1@test.invalid', 'a0000000-0000-0000-0000-00000000ab01'),
  ('bbbb0000-0000-0000-0000-00000000ab02', 'NotifyTwo',   'n2@test.invalid', 'b0000000-0000-0000-0000-00000000ab02'),
  ('cccc0000-0000-0000-0000-00000000ab03', 'NotifyThree', 'n3@test.invalid', 'c0000000-0000-0000-0000-00000000ab03');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9a000000-0000-0000-0000-00000000000a', 'Notify Game', now() + interval '7 days', 1, 200, 'full');

-- Three players join the waitlist through the real RPC.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000ab01');
select public.join_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;
select pg_temp.act_as('b0000000-0000-0000-0000-00000000ab02');
select public.join_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;
select pg_temp.act_as('c0000000-0000-0000-0000-00000000ab03');
select public.join_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;

-- =============================================================================
-- authorization — service-role only
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ab01');
select pg_temp.ok_probe(
  $q$select public.notify_waitlist('9a000000-0000-0000-0000-00000000000a')$q$,
  'denied',
  'an authenticated player is denied execute on notify_waitlist');
reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok_probe(
  $q$select public.notify_waitlist('9a000000-0000-0000-0000-00000000000a')$q$,
  'denied',
  'an anonymous caller is denied execute on notify_waitlist');
reset role;

-- The in-function guard is what catches a caller who HAS execute but is not
-- service-role — the postgres owner running it directly.
select pg_temp.ok_probe(
  $q$select public.notify_waitlist('9a000000-0000-0000-0000-00000000000a')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-service-role caller with execute is rejected in-function');

-- =============================================================================
-- fan-out: one stamp and one event per active waitlisted player
-- =============================================================================

select pg_temp.act_as_service();
select count(*) as notified_count from public.notify_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '9a000000-0000-0000-0000-00000000000a'
      and notified_at is not null) = 3,
  'all three waitlisted players are stamped with notified_at');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_notified'
      and game_id = '9a000000-0000-0000-0000-00000000000a') = 3,
  'exactly three waitlist_notified events were written — one per player');

select pg_temp.ok(
  (select count(distinct player_id) from public.events
    where event_type = 'waitlist_notified'
      and game_id = '9a000000-0000-0000-0000-00000000000a') = 3,
  'the three events name three distinct players');

-- =============================================================================
-- re-notification: notified_at is a timestamp, NOT a suppression flag
-- =============================================================================

select pg_temp.act_as_service();
select count(*) from public.notify_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_notified'
      and game_id = '9a000000-0000-0000-0000-00000000000a') = 6,
  'a second release re-notifies everyone — six events, not three');

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '9a000000-0000-0000-0000-00000000000a'
      and notified_at is not null) = 3,
  'still three waitlist rows, each carrying the LAST notification time');

-- =============================================================================
-- a converted player is no longer active and is not re-notified
-- =============================================================================

-- Convert player three by hand: this suite is about notify_waitlist, and
-- create_booking's own conversion path is asserted in booking_create.sql.
update public.waitlist
   set converted_booking_id = null, notified_at = null
 where game_id = '9a000000-0000-0000-0000-00000000000a'
   and player_id = 'cccc0000-0000-0000-0000-00000000ab03';

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk)
values ('bbbb1111-0000-0000-0000-00000000000b', '9a000000-0000-0000-0000-00000000000a',
        'cccc0000-0000-0000-0000-00000000ab03', 'reserved', 'cash', 200);

update public.waitlist
   set converted_booking_id = 'bbbb1111-0000-0000-0000-00000000000b'
 where game_id = '9a000000-0000-0000-0000-00000000000a'
   and player_id = 'cccc0000-0000-0000-0000-00000000ab03';

select pg_temp.act_as_service();
select count(*) from public.notify_waitlist('9a000000-0000-0000-0000-00000000000a');
reset role;

select pg_temp.ok(
  (select notified_at is null from public.waitlist
    where game_id = '9a000000-0000-0000-0000-00000000000a'
      and player_id = 'cccc0000-0000-0000-0000-00000000ab03'),
  'a converted player is skipped by the fan-out');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_notified'
      and game_id = '9a000000-0000-0000-0000-00000000000a') = 8,
  'the third fan-out notified only the two still-active players');

-- =============================================================================
-- same-transaction guarantee
-- =============================================================================

do $$
declare v_before integer; v_after integer; v_stamps_before integer; v_stamps_after integer;
begin
  select count(*) into v_before from public.events where event_type = 'waitlist_notified';
  select count(*) into v_stamps_before from public.waitlist where notified_at is not null;

  begin
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    perform public.notify_waitlist('9a000000-0000-0000-0000-00000000000a');
    raise exception 'FORCED_ROLLBACK';
  exception
    when others then null;
  end;
  reset role;

  select count(*) into v_after from public.events where event_type = 'waitlist_notified';
  select count(*) into v_stamps_after from public.waitlist where notified_at is not null;

  perform pg_temp.ok(
    v_after = v_before and v_stamps_after = v_stamps_before,
    'a forced failure mid-fan-out leaves neither the stamps nor the events',
    format('events %s->%s, stamps %s->%s', v_before, v_after, v_stamps_before, v_stamps_after));
end $$;

-- =============================================================================
-- a game that is not taking bookings notifies nobody
-- =============================================================================

update public.games set status = 'cancelled'
 where id = '9a000000-0000-0000-0000-00000000000a';

select pg_temp.act_as_service();
select pg_temp.ok(
  (select count(*) from public.notify_waitlist('9a000000-0000-0000-0000-00000000000a')) = 0,
  'a cancelled game notifies nobody');
reset role;

-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
