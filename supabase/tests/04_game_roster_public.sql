-- =============================================================================
-- Phase 4 assertions — game_roster_public
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/04_game_roster_public.sql
--
-- Transaction-wrapped and rolled back; safe against the live database.
--
-- This view is the ONLY anonymous read path into booking data and the single
-- highest-risk PII surface in the system. Being SECURITY DEFINER it bypasses
-- the RLS on `bookings`, `players` and `games`, so its projection and its
-- game-status filter are the sole enforcement points — there is no second
-- line of defence behind it. These assertions are therefore written against
-- the ANON role specifically, since anon is the threat model.
-- =============================================================================

begin;

-- --- harness -----------------------------------------------------------------

create temp table _results (
  seq serial primary key,
  label text,
  passed boolean,
  detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

-- --- fixtures: one booking on a game of every status -------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'player-a@test.invalid');

insert into public.players (id, nickname, email, phone, auth_user_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'RosterPlayerA', 'player-a@test.invalid', '+420111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'RosterPlayerB', 'player-b@test.invalid', '+420222222222', null);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('11110000-0000-0000-0000-000000000001', 'Draft Venue',     now() + interval '7 days', 12, 200, 'draft'),
  ('22220000-0000-0000-0000-000000000002', 'Published Venue', now() + interval '8 days', 12, 200, 'published'),
  ('33330000-0000-0000-0000-000000000003', 'Full Venue',      now() + interval '9 days', 12, 200, 'full'),
  ('44440000-0000-0000-0000-000000000004', 'Played Venue',    now() - interval '2 days', 12, 200, 'played'),
  ('55550000-0000-0000-0000-000000000005', 'Settled Venue',   now() - interval '3 days', 12, 200, 'settled'),
  ('66660000-0000-0000-0000-000000000006', 'Cancelled Venue', now() + interval '5 days', 12, 200, 'cancelled');

-- One confirmed booking per game, all for player A.
insert into public.bookings (game_id, player_id, status, payment_method, price_czk)
select g.id, 'a0000000-0000-0000-0000-00000000000a', 'confirmed', 'cash', 200
from public.games g;

-- On the published game, add a cancelled and an expired booking for player B:
-- neither is a spot in the lineup and neither may appear in the roster.
insert into public.bookings (game_id, player_id, status, payment_method, price_czk) values
  ('22220000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'cancelled', 'cash', 200);

-- =============================================================================
-- projection — as ANON
-- =============================================================================

set local role anon;

-- WIDENED THREE TIMES, and each edit is deliberate rather than accommodating.
-- Contract §4a (v1.1.3) ratified `photo_path` joining this projection in Phase
-- 15, and `games_played` joins it in migration 39 under the same rule — the
-- widening and the rendering that consumes it in one change. The assertion
-- moves because the ruling moved it; it stays EXHAUSTIVE because that is what
-- makes the next widening impossible to do quietly.
--
-- ROUND 11 added `is_guest`, `guest_of` and `guest_index` when the view began
-- emitting ONE ROW PER SEAT. Each is a fact about a SEAT rather than about a
-- person: draw a monogram, name the player who brought this one — a nickname
-- the holder's own row already publishes for the same game — and number it.
--
-- THIS LINE WAS RED FOR A ROUND BEFORE ANYBODY SAW IT, which is worth writing
-- down: round 11 read the runner's output through `tail`, and the numbered
-- suites sort first, so the one guard that fired scrolled off the top. The
-- lesson is about reading test output, not about the test.
--
-- The withholding assertion below is UNCHANGED and is the one that matters:
-- player_id, email and phone did not cross and are not going to.
-- EIGHT SINCE ROUND 25, and the list is restated in full rather than patched:
-- the point of enumerating is that a new column has to be TYPED here by
-- somebody who looked at it. `is_pending` is a boolean saying the seat belongs
-- to a checkout in progress; it identifies nobody, and the row it appears on
-- has every naming column null. The withholding assertion below is unchanged
-- and is still the one that matters.
select pg_temp.ok(
  (select array_agg(column_name::text order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roster_public')
  = array['game_id', 'games_played', 'guest_index', 'guest_of', 'is_guest',
          'is_pending', 'nickname', 'photo_path'],
  'the view projects EXACTLY those eight columns and no ninth',
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roster_public'));

select pg_temp.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
       and column_name in ('player_id', 'email', 'phone', 'id', 'auth_user_id')),
  'the view exposes no player_id, email, phone, id or auth_user_id');

-- =============================================================================
-- game-status filter — the enforcement point that must live in the view body
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '11110000-0000-0000-0000-000000000001') = 0,
  'a DRAFT game returns zero roster rows',
  'count=' || (select count(*) from public.game_roster_public
                where game_id = '11110000-0000-0000-0000-000000000001'));

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '66660000-0000-0000-0000-000000000006') = 0,
  'a CANCELLED game returns zero roster rows',
  'count=' || (select count(*) from public.game_roster_public
                where game_id = '66660000-0000-0000-0000-000000000006'));

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '22220000-0000-0000-0000-000000000002') = 1,
  'a PUBLISHED game returns its active roster');

select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id in ('22220000-0000-0000-0000-000000000002',
                      '33330000-0000-0000-0000-000000000003',
                      '44440000-0000-0000-0000-000000000004',
                      '55550000-0000-0000-0000-000000000005')) = 4,
  'published, full, played and settled games all return rows');

-- Scoped to this file's fixture games: a global count(*) over the view passed
-- only against an empty database and broke as soon as `npm run seed` existed.
select pg_temp.ok(
  (select count(*) from public.game_roster_public where game_id in (
     '11110000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000002',
     '33330000-0000-0000-0000-000000000003','44440000-0000-0000-0000-000000000004',
     '55550000-0000-0000-0000-000000000005','66660000-0000-0000-0000-000000000006')) = 4,
  'the view returns rows for the 4 public fixture games and nothing else',
  'count=' || (select count(*) from public.game_roster_public where game_id in (
     '11110000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000002',
     '33330000-0000-0000-0000-000000000003','44440000-0000-0000-0000-000000000004',
     '55550000-0000-0000-0000-000000000005','66660000-0000-0000-0000-000000000006')));

-- =============================================================================
-- booking-status filter
-- =============================================================================

select pg_temp.ok(
  not exists (select 1 from public.game_roster_public where nickname = 'RosterPlayerB'),
  'a cancelled booking does not appear in the roster');

select pg_temp.ok(
  /*
   * Asserted against the view BODY rather than by reading the column.
   *
   * The filter is unchanged and still the enforcement point; what changed is
   * that `status` is no longer published (migration 20260808150000), so there
   * is no column left to aggregate over. Reading the definition keeps the
   * assertion honest — the filter has to be IN the view, which is the property
   * that matters — without re-publishing the value to prove it.
   */
  (select pg_get_viewdef('public.game_roster_public'::regclass, true)
     like '%booking_holds_seat(b.status, b.payment_pending_at)%'),
  'every roster row goes through booking_holds_seat');

/*
 * ...AND THAT PREDICATE IS ASSERTED DIRECTLY, which the inlined version could
 * not be.
 *
 * Round 12 moved the filter out of the view body and into
 * `booking_holds_seat`, because the same rule is needed by `game_seats_taken`
 * and by both halves of this view — and a capacity rule written out three
 * times is one that will disagree with itself. Reading the view definition
 * now proves only that the rule is CALLED, so the rule itself is tested here:
 * the two active statuses hold a seat, the two terminal ones do not, and an
 * online payment that ran out of time stops holding one without its status
 * changing at all.
 */
select pg_temp.ok(
  public.booking_holds_seat('reserved',  null)
  and public.booking_holds_seat('confirmed', null)
  and not public.booking_holds_seat('cancelled', null)
  and not public.booking_holds_seat('expired',   null),
  'booking_holds_seat admits exactly the two active statuses');

select pg_temp.ok(
  public.booking_holds_seat('reserved', now())
  and not public.booking_holds_seat(
        'reserved', now() - public.online_payment_window() - interval '1 second'),
  'a reserved booking stops holding its seat once its payment window closes');

select pg_temp.ok(
  public.booking_holds_seat(
    'confirmed', now() - public.online_payment_window() - interval '1 day'),
  'a CONFIRMED booking holds its seat whatever the pending stamp says');

-- =============================================================================
-- the view is genuinely reachable by anon (a denied read would pass the
-- filter assertions above vacuously, which is the failure mode to rule out)
-- =============================================================================

select pg_temp.ok(
  (select nickname from public.game_roster_public
    where game_id = '22220000-0000-0000-0000-000000000002') = 'RosterPlayerA',
  'anon can actually read the view (filters above are not passing vacuously)');

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
