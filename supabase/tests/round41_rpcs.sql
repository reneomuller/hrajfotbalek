-- =============================================================================
-- ROUND 41 — "tests for every action": the six RPCs no suite drilled.
--
-- An audit of every action on the platform found these called from the app
-- with no SQL test of their own: leave_waitlist, dismiss_all_notifications,
-- mark_notifications_read, admin_remove_booking, cancel_game_with_reason and
-- set_game_language. Each is drilled here for who may call it, what it
-- refuses, and what it changes.
--
-- Run:  node supabase/tests/run.mjs round41_rpcs
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

-- The booking on a game, read as the table owner: a probe running as a role
-- sees only its own rows, and would hand the RPC a null.
create function pg_temp.booking_of(p_game uuid)
returns uuid language sql security definer as $$
  select id from public.bookings where game_id = p_game order by created_at desc limit 1
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email)
select ('41420000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r41r-' || n || '@test.invalid'
  from generate_series(1, 3) n;

-- 1 an admin · 2 a player on the waitlist · 3 the player holding the seat
insert into public.players (id, nickname, email, auth_user_id, is_admin, country)
values
  ('4e420000-0000-0000-0000-000000000001', 'R41rAdmin', 'r41r-1@test.invalid', '41420000-0000-0000-0000-000000000001', true,  'CZ'),
  ('4e420000-0000-0000-0000-000000000002', 'R41rWait',  'r41r-2@test.invalid', '41420000-0000-0000-0000-000000000002', false, 'CZ'),
  ('4e420000-0000-0000-0000-000000000003', 'R41rSeat',  'r41r-3@test.invalid', '41420000-0000-0000-0000-000000000003', false, 'CZ');

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94142000-0000-0000-0000-0000000000a1', 'R41r Full',     now() + interval '3 days', 1,  180, 'published', 90),
  ('94142000-0000-0000-0000-0000000000a2', 'R41r Open',     now() + interval '4 days', 12, 180, 'published', 90),
  ('94142000-0000-0000-0000-0000000000a3', 'R41r Doomed',   now() + interval '5 days', 12, 180, 'published', 90);

select pg_temp.act_as('41420000-0000-0000-0000-000000000003');
select public.create_booking('94142000-0000-0000-0000-0000000000a1', 'cash', null, null, 0);
select public.create_booking('94142000-0000-0000-0000-0000000000a2', 'cash', null, null, 0);
select public.create_booking('94142000-0000-0000-0000-0000000000a3', 'cash', null, null, 0);
reset role;

insert into public.notifications (id, title, body, audience) values
  ('94142000-0000-0000-0000-0000000000b1', 'Everyone 1', 'x', 'all'),
  ('94142000-0000-0000-0000-0000000000b2', 'Everyone 2', 'x', 'all');
insert into public.notifications (id, title, body, recipient_id) values
  ('94142000-0000-0000-0000-0000000000b3', 'For Seat', 'x', '4e420000-0000-0000-0000-000000000003');

-- =============================================================================
-- leave_waitlist
-- =============================================================================

select pg_temp.act_as('41420000-0000-0000-0000-000000000002');
select public.join_waitlist('94142000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  exists (select 1 from public.waitlist where game_id = '94142000-0000-0000-0000-0000000000a1'
            and player_id = '4e420000-0000-0000-0000-000000000002'),
  'precondition: the player is on the waitlist of a full game');
select pg_temp.ok_probe(
  $q$select public.leave_waitlist('94142000-0000-0000-0000-0000000000a1'::uuid)$q$,
  'rows:1', 'they can leave it');
reset role;
select pg_temp.ok(
  not exists (select 1 from public.waitlist where game_id = '94142000-0000-0000-0000-0000000000a1'
                and player_id = '4e420000-0000-0000-0000-000000000002'),
  'and the row is gone');

select pg_temp.act_as_anon();
select pg_temp.ok(
  pg_temp.probe($q$select public.leave_waitlist('94142000-0000-0000-0000-0000000000a1'::uuid)$q$)
    in ('denied', 'raise:INSUFFICIENT_PERMISSION'),
  'a visitor cannot leave anybody''s waitlist');
reset role;

-- =============================================================================
-- mark_notifications_read and dismiss_all_notifications
-- =============================================================================

select pg_temp.act_as('41420000-0000-0000-0000-000000000003');
select pg_temp.ok(
  (select count(*) from public.my_notifications(100) where not is_read and id::text like '94142000%') = 3,
  'the seat holder starts with three unread: two broadcasts and their own');
select public.mark_notifications_read();
select pg_temp.ok(
  (select count(*) from public.my_notifications(100) where not is_read and id::text like '94142000%') = 0,
  'mark_notifications_read reads them all');
select public.dismiss_all_notifications();
select pg_temp.ok(
  (select count(*) from public.my_notifications(100) where id::text like '94142000%') = 0,
  'dismiss_all_notifications empties their bell');
reset role;

select pg_temp.act_as('41420000-0000-0000-0000-000000000002');
select pg_temp.ok(
  (select count(*) from public.my_notifications(100) where id::text like '94142000%') = 2,
  'and nobody else''s: the waiting player still has both broadcasts');
reset role;

select pg_temp.ok(
  (select count(*) from public.notifications where id::text like '94142000%') = 3,
  'clearing a bell deletes no notification');

select pg_temp.act_as_anon();
select pg_temp.ok(
  pg_temp.probe($q$select public.dismiss_all_notifications()$q$) in ('denied', 'raise:INSUFFICIENT_PERMISSION'),
  'a visitor has no bell to clear');
reset role;

-- =============================================================================
-- admin_remove_booking
-- =============================================================================

select pg_temp.act_as('41420000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking(pg_temp.booking_of('94142000-0000-0000-0000-0000000000a2'))$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot remove somebody''s booking');
reset role;

select pg_temp.act_as('41420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking(pg_temp.booking_of('94142000-0000-0000-0000-0000000000a2'))$q$,
  'rows:1', 'an admin removes it');
reset role;
select pg_temp.ok(
  (select status from public.bookings where game_id = '94142000-0000-0000-0000-0000000000a2' limit 1) = 'cancelled'
  and public.game_seats_taken('94142000-0000-0000-0000-0000000000a2') = 0,
  'the booking is cancelled and its seat free');
select pg_temp.act_as('41420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking(pg_temp.booking_of('94142000-0000-0000-0000-0000000000a2'))$q$,
  'raise:INVALID_TRANSITION', 'removing it twice is refused, not repeated');
reset role;

-- =============================================================================
-- set_game_language
-- =============================================================================

select pg_temp.act_as('41420000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.set_game_language('94142000-0000-0000-0000-0000000000a2'::uuid, 'uk-ru')$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot set a game''s language');
reset role;
select pg_temp.act_as('41420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.set_game_language('94142000-0000-0000-0000-0000000000a2'::uuid, 'de-fr')$q$,
  'raise:INVALID_LANGUAGE', 'a pairing that does not exist is refused');
select pg_temp.ok_probe(
  $q$select public.set_game_language('00000000-0000-0000-0000-000000000000'::uuid, 'uk-ru')$q$,
  'raise:GAME_NOT_FOUND', 'so is a game that does not');
select public.set_game_language('94142000-0000-0000-0000-0000000000a2', 'uk-ru');
reset role;
select pg_temp.ok(
  (select language from public.games where id = '94142000-0000-0000-0000-0000000000a2') = 'uk-ru',
  'an admin sets it');

-- =============================================================================
-- cancel_game_with_reason
-- =============================================================================

select pg_temp.act_as('41420000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.cancel_game_with_reason('94142000-0000-0000-0000-0000000000a3'::uuid, 'Rain')$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot cancel a game');
reset role;
select pg_temp.act_as('41420000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.cancel_game_with_reason('94142000-0000-0000-0000-0000000000a3'::uuid, '   ')$q$,
  'raise:REASON_REQUIRED', 'a cancellation needs a reason');
select pg_temp.ok_probe(
  $q$select public.cancel_game_with_reason('94142000-0000-0000-0000-0000000000a3'::uuid, 'Pitch flooded')$q$,
  'rows:1', 'an admin cancels it with one');
reset role;
select pg_temp.ok(
  (select status from public.games where id = '94142000-0000-0000-0000-0000000000a3') = 'cancelled'
  and (select status from public.bookings where game_id = '94142000-0000-0000-0000-0000000000a3' limit 1) = 'cancelled',
  'the game and its booking are cancelled');
select pg_temp.ok(
  exists (select 1 from public.notifications where body like '%Pitch flooded%' or title like '%Pitch flooded%'),
  'and the reason is published for the players');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
