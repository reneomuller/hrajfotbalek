-- =============================================================================
-- Phase 24 assertions — mark_attendance + the settle guard
--
-- Run:  node supabase/tests/run.mjs mark_attendance
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- `call()` consumes the value it selects (POLISH.md): the shared `probe()`
-- helper's `count(*)` over an unread CTE column lets the planner prune the call
-- for a non-volatile function, skipping the privilege check.
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
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000ad11', 'admin-a@test.invalid'),
  ('b0000000-0000-0000-0000-00000000b111', 'player-a@test.invalid'),
  ('c0000000-0000-0000-0000-00000000c111', 'player-b@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000ad11', 'AttAdmin', 'admin-a@test.invalid',  'a0000000-0000-0000-0000-00000000ad11', true),
  ('bbbb0000-0000-0000-0000-00000000b111', 'AttOne',   'player-a@test.invalid', 'b0000000-0000-0000-0000-00000000b111', false),
  ('cccc0000-0000-0000-0000-00000000c111', 'AttTwo',   'player-b@test.invalid', 'c0000000-0000-0000-0000-00000000c111', false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('88880000-0000-0000-0000-00000000e111', 'Attendance Pitch', now() - interval '2 hours', 10, 200, 'played');

insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk) values
  ('77770000-0000-0000-0000-00000000e111', '88880000-0000-0000-0000-00000000e111',
   'bbbb0000-0000-0000-0000-00000000b111', 'cash', 'confirmed', 200),
  ('77770000-0000-0000-0000-00000000e222', '88880000-0000-0000-0000-00000000e111',
   'cccc0000-0000-0000-0000-00000000c111', 'cash', 'reserved', 200);

-- =============================================================================
-- the write and its event land together
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select public.mark_attendance('77770000-0000-0000-0000-00000000e111', 'present');
reset role;

select pg_temp.ok(
  (select attendance = 'present' from public.bookings
    where id = '77770000-0000-0000-0000-00000000e111'),
  'marking present writes bookings.attendance');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'attendance_marked'
      and booking_id = '77770000-0000-0000-0000-00000000e111') = 1,
  'the same call wrote exactly one attendance_marked event');

select pg_temp.ok(
  (select metadata->>'attendance' from public.events
    where event_type = 'attendance_marked'
      and booking_id = '77770000-0000-0000-0000-00000000e111') = 'present',
  'the event records which way it was marked');

-- A correction is a new fact on an append-only log, not an edit of the old one.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select public.mark_attendance('77770000-0000-0000-0000-00000000e111', 'no_show');
reset role;

select pg_temp.ok(
  (select attendance = 'no_show' from public.bookings
    where id = '77770000-0000-0000-0000-00000000e111'),
  're-marking corrects the column');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'attendance_marked'
      and booking_id = '77770000-0000-0000-0000-00000000e111') = 2,
  'the correction appends a second event rather than rewriting the first');

-- --- same-transaction guarantee ----------------------------------------------

do $$
declare v_before_events integer; v_after_events integer; v_attendance text;
begin
  select count(*) into v_before_events from public.events where event_type = 'attendance_marked';

  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'a0000000-0000-0000-0000-00000000ad11', 'role', 'authenticated')::text, true);
    perform public.mark_attendance('77770000-0000-0000-0000-00000000e222', 'present');
    raise exception 'FORCED_ROLLBACK';
  exception
    when others then null;
  end;
  reset role;

  select count(*) into v_after_events from public.events where event_type = 'attendance_marked';
  select attendance::text into v_attendance from public.bookings
   where id = '77770000-0000-0000-0000-00000000e222';

  perform pg_temp.ok(
    v_after_events = v_before_events and v_attendance is null,
    'a forced failure after the write leaves neither the attendance nor the event',
    format('events %s->%s, attendance %s', v_before_events, v_after_events, coalesce(v_attendance, 'null')));
end $$;

-- =============================================================================
-- authorization — a player cannot mark their own attendance
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-00000000b111');
select pg_temp.ok_call(
  $q$select public.mark_attendance('77770000-0000-0000-0000-00000000e111', 'present')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot mark attendance on their own booking');
reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok_call(
  $q$select public.mark_attendance('77770000-0000-0000-0000-00000000e111', 'present')$q$,
  'denied',
  'an anonymous caller is denied execute on mark_attendance');
reset role;

-- =============================================================================
-- transition legality
-- =============================================================================

update public.bookings set status = 'cancelled'
 where id = '77770000-0000-0000-0000-00000000e222';

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select pg_temp.ok_call(
  $q$select public.mark_attendance('77770000-0000-0000-0000-00000000e222', 'no_show')$q$,
  'raise:INVALID_TRANSITION',
  'a cancelled booking cannot be marked');

select pg_temp.ok_call(
  $q$select public.mark_attendance('00000000-0000-0000-0000-0000000000ff', 'present')$q$,
  'raise:BOOKING_NOT_FOUND',
  'marking a booking that does not exist is rejected');
reset role;

-- The enum itself refuses anything outside present/no_show — there is no code
-- path that could pass a third value, because the type has only two.
select pg_temp.ok(
  (select count(*) from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'attendance_status') = 2,
  'attendance_status admits exactly present and no_show');

-- =============================================================================
-- the settle guard
-- =============================================================================

update public.bookings set status = 'reserved'
 where id = '77770000-0000-0000-0000-00000000e222';

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select pg_temp.ok_call(
  $q$select public.settle_game('88880000-0000-0000-0000-00000000e111')$q$,
  'raise:RESERVED_BOOKINGS_REMAIN',
  'settle is refused while an unpaid reservation remains');
reset role;

select pg_temp.ok(
  (select status = 'played' from public.games
    where id = '88880000-0000-0000-0000-00000000e111'),
  'the refused settle left the game played, not half-settled');

-- Resolve it the way the admin panel does — a cash confirm on the pitch.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select public.confirm_booking('77770000-0000-0000-0000-00000000e222');
select pg_temp.ok_call(
  $q$select public.settle_game('88880000-0000-0000-0000-00000000e111')$q$,
  'settled',
  'settle succeeds once nothing is reserved');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '88880000-0000-0000-0000-00000000e111' and status = 'reserved') = 0,
  'zero reserved bookings survive into settled');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'game_settled'
      and game_id = '88880000-0000-0000-0000-00000000e111') = 1,
  'settling emitted game_settled');

-- =============================================================================
-- under-capacity games still get played, straight from published
-- =============================================================================

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('88880000-0000-0000-0000-00000000e222', 'Half Empty', now() - interval '1 hour', 20, 200, 'published');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad11');
select pg_temp.ok_call(
  $q$select public.mark_game_played('88880000-0000-0000-0000-00000000e222')$q$,
  'played',
  'an under-capacity published game can be marked played directly');
select pg_temp.ok_call(
  $q$select public.settle_game('88880000-0000-0000-0000-00000000e222')$q$,
  'settled',
  'and then settled, with no bookings on it at all');
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
