-- =============================================================================
-- Phase 20 assertions — mark_nudged / mark_reminder_sent
--
-- Run:  node supabase/tests/run.mjs cron_stamps
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
  ('a0000000-0000-0000-0000-00000000cd01', 'c1@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-00000000cd01', 'CronPlayer', 'c1@test.invalid', 'a0000000-0000-0000-0000-00000000cd01');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9b000000-0000-0000-0000-00000000000b', 'Cron Game', now() + interval '2 days', 10, 200, 'published');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cd01');
select public.create_booking('9b000000-0000-0000-0000-00000000000b', 'qr');
reset role;

create function pg_temp.booking_id()
returns uuid language sql security definer as $$
  select b.id from public.bookings b
   where b.game_id = '9b000000-0000-0000-0000-00000000000b' limit 1;
$$;

-- =============================================================================
-- authorization — service-role only
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cd01');
select pg_temp.ok_probe(
  $q$select public.mark_nudged(pg_temp.booking_id(), 12)$q$,
  'denied',
  'an authenticated player is denied execute on mark_nudged');
select pg_temp.ok_probe(
  $q$select public.mark_reminder_sent(pg_temp.booking_id())$q$,
  'denied',
  'an authenticated player is denied execute on mark_reminder_sent');
reset role;

select pg_temp.ok_probe(
  $q$select public.mark_nudged(pg_temp.booking_id(), 12)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-service-role caller with execute is rejected in-function (nudge)');
select pg_temp.ok_probe(
  $q$select public.mark_reminder_sent(pg_temp.booking_id())$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-service-role caller with execute is rejected in-function (reminder)');

-- =============================================================================
-- mark_nudged — stamp + event in one transaction, window from the argument
-- =============================================================================

select pg_temp.act_as_service();
select pg_temp.ok(
  public.mark_nudged(pg_temp.booking_id(), 12),
  'the first mark_nudged returns true — this call did the stamping');
reset role;

select pg_temp.ok(
  (select nudge_sent_at is not null from public.bookings where id = pg_temp.booking_id()),
  'nudge_sent_at is stamped');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'nudge_sent' and booking_id = pg_temp.booking_id()) = 1,
  'exactly one nudge_sent event was written in the same call');

-- The grace window comes from the ARGUMENT, not from a literal in the SQL.
select pg_temp.ok(
  (select expires_at between now() + interval '11 hours 55 minutes'
                         and now() + interval '12 hours 5 minutes'
     from public.bookings where id = pg_temp.booking_id()),
  'expires_at is now() + the grace hours passed in by the caller');

-- =============================================================================
-- already-stamped is a no-op, not a re-stamp
-- =============================================================================

select pg_temp.act_as_service();
select pg_temp.ok(
  not public.mark_nudged(pg_temp.booking_id(), 12),
  'a second mark_nudged returns false rather than re-stamping');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'nudge_sent' and booking_id = pg_temp.booking_id()) = 1,
  'the second call wrote no second nudge_sent event');

-- A different grace window on the second call must not move the deadline.
select pg_temp.act_as_service();
select public.mark_nudged(pg_temp.booking_id(), 99);
reset role;

select pg_temp.ok(
  (select expires_at < now() + interval '13 hours'
     from public.bookings where id = pg_temp.booking_id()),
  'an already-nudged booking keeps its original deadline');

-- =============================================================================
-- mark_reminder_sent
-- =============================================================================

select pg_temp.act_as_service();
select pg_temp.ok(
  public.mark_reminder_sent(pg_temp.booking_id()),
  'the first mark_reminder_sent returns true');
select pg_temp.ok(
  not public.mark_reminder_sent(pg_temp.booking_id()),
  'a second mark_reminder_sent returns false');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'reminder_sent' and booking_id = pg_temp.booking_id()) = 1,
  'exactly one reminder_sent event exists after two calls');

-- =============================================================================
-- a confirmed booking is never nudged
-- =============================================================================

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9e000000-0000-0000-0000-0000000000ee', 'Paid Game', now() + interval '2 days', 10, 200, 'published');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000cd01');
select public.create_booking('9e000000-0000-0000-0000-0000000000ee', 'qr');
reset role;

update public.bookings set status = 'confirmed'
 where game_id = '9e000000-0000-0000-0000-0000000000ee';

select pg_temp.act_as_service();
select pg_temp.ok(
  not public.mark_nudged(
    (select id from public.bookings where game_id = '9e000000-0000-0000-0000-0000000000ee'), 12),
  'a confirmed (prepaid) booking is never nudged');
reset role;

select pg_temp.ok(
  (select nudge_sent_at is null from public.bookings
    where game_id = '9e000000-0000-0000-0000-0000000000ee'),
  'the confirmed booking carries no nudge stamp');

-- =============================================================================
-- same-transaction guarantee
-- =============================================================================

do $$
declare v_events_before integer; v_events_after integer;
        v_stamp_before timestamptz; v_stamp_after timestamptz;
        v_id uuid;
begin
  insert into public.games (id, venue, starts_at, capacity, price_czk, status)
  values ('9f000000-0000-0000-0000-0000000000ef', 'Rollback Game', now() + interval '2 days', 10, 200, 'published');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'a0000000-0000-0000-0000-00000000cd01', 'role', 'authenticated')::text, true);
  perform public.create_booking('9f000000-0000-0000-0000-0000000000ef', 'qr');
  reset role;

  select id into v_id from public.bookings where game_id = '9f000000-0000-0000-0000-0000000000ef';
  select count(*) into v_events_before from public.events where event_type = 'nudge_sent';
  select nudge_sent_at into v_stamp_before from public.bookings where id = v_id;

  begin
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    perform public.mark_nudged(v_id, 12);
    raise exception 'FORCED_ROLLBACK';
  exception
    when others then null;
  end;
  reset role;

  select count(*) into v_events_after from public.events where event_type = 'nudge_sent';
  select nudge_sent_at into v_stamp_after from public.bookings where id = v_id;

  perform pg_temp.ok(
    v_events_after = v_events_before and v_stamp_after is not distinct from v_stamp_before,
    'a forced failure after the stamp leaves neither the stamp nor the event',
    format('events %s->%s', v_events_before, v_events_after));
end $$;

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
