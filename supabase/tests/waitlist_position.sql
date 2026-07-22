-- =============================================================================
-- Polish batch 1 assertions — waitlist_position
--
-- Run:  node supabase/tests/run.mjs waitlist_position
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- The point under test is that a player learns their own position WITHOUT
-- learning anything else: own-row RLS hides the rows the count is taken over,
-- so the function must be the only path to the number and must project nothing
-- but the integer.
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

-- Calls the function under test and CONSUMES the value.
--
-- The shared `probe()` helper used by the other suites wraps the call in
-- `with _p as (<sql>) select count(*) from _p`, which cannot be used here:
-- count(*) never reads the CTE's column, so the planner prunes the call out of
-- a non-volatile function's plan and the executor never performs the privilege
-- check — the probe reports a row where a direct call is denied. Selecting the
-- result INTO a variable forces the evaluation, and therefore the check.
create function pg_temp.call_position(p_game_id uuid)
returns text language plpgsql as $$
declare v integer;
begin
  select public.waitlist_position(p_game_id) into v;
  return coalesce(v::text, 'null');
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
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
  ('a0000000-0000-0000-0000-0000000000f1', 'pa@test.invalid'),
  ('b0000000-0000-0000-0000-0000000000f2', 'pb@test.invalid'),
  ('c0000000-0000-0000-0000-0000000000f3', 'pc@test.invalid'),
  ('d0000000-0000-0000-0000-0000000000f4', 'pd@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-0000000000f1', 'PosPlayerA', 'pa@test.invalid', 'a0000000-0000-0000-0000-0000000000f1'),
  ('bbbb0000-0000-0000-0000-0000000000f2', 'PosPlayerB', 'pb@test.invalid', 'b0000000-0000-0000-0000-0000000000f2'),
  ('cccc0000-0000-0000-0000-0000000000f3', 'PosPlayerC', 'pc@test.invalid', 'c0000000-0000-0000-0000-0000000000f3'),
  ('dddd0000-0000-0000-0000-0000000000f4', 'PosPlayerD', 'pd@test.invalid', 'd0000000-0000-0000-0000-0000000000f4');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('8f000000-0000-0000-0000-00000000000f', 'Position Game', now() + interval '7 days', 1, 200, 'full'),
  ('8e000000-0000-0000-0000-00000000000e', 'Other Game',    now() + interval '8 days', 1, 200, 'full');

-- Distinct joined_at values, inserted in a deliberate order: A first, then B,
-- then C. Written directly rather than through join_waitlist because the point
-- here is the ORDER, and three calls in one transaction share a timestamp.
insert into public.waitlist (game_id, player_id, joined_at) values
  ('8f000000-0000-0000-0000-00000000000f', 'aaaa0000-0000-0000-0000-0000000000f1', now() - interval '30 minutes'),
  ('8f000000-0000-0000-0000-00000000000f', 'bbbb0000-0000-0000-0000-0000000000f2', now() - interval '20 minutes'),
  ('8f000000-0000-0000-0000-00000000000f', 'cccc0000-0000-0000-0000-0000000000f3', now() - interval '10 minutes');

-- =============================================================================
-- the position itself — 1-based, by join order
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000f1');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') = 1,
  'the first player to join is #1');
reset role;

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000f2');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') = 2,
  'the second player to join is #2');
reset role;

select pg_temp.act_as('c0000000-0000-0000-0000-0000000000f3');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') = 3,
  'the third player to join is #3');
reset role;

-- =============================================================================
-- null, not an error, when there is no position to report
-- =============================================================================

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000f4');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') is null,
  'a player who is not on the list has no position');

select pg_temp.ok(
  public.waitlist_position('00000000-0000-0000-0000-0000000000ff') is null,
  'a game that does not exist yields null rather than raising');
reset role;

-- An authenticated session with no player row (mid-signup) gets null too: this
-- renders on a public page, so a raise here would break the page for them.
select pg_temp.act_as('e0000000-0000-0000-0000-0000000000f5');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') is null,
  'an authenticated session with no player row yields null, not an error');
reset role;

-- =============================================================================
-- converted rows leave the queue
-- =============================================================================

-- A converts to a booking; B and C each move up one.
insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk)
values ('7f000000-0000-0000-0000-00000000000f', '8f000000-0000-0000-0000-00000000000f',
        'aaaa0000-0000-0000-0000-0000000000f1', 'cash', 'reserved', 200);

update public.waitlist
   set converted_booking_id = '7f000000-0000-0000-0000-00000000000f'
 where game_id = '8f000000-0000-0000-0000-00000000000f'
   and player_id = 'aaaa0000-0000-0000-0000-0000000000f1';

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000f2');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') = 1,
  'a converted row leaves the queue and everyone behind it moves up');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000f1');
select pg_temp.ok(
  public.waitlist_position('8f000000-0000-0000-0000-00000000000f') is null,
  'the converted player no longer holds a position');
reset role;

-- =============================================================================
-- scoped to one game
-- =============================================================================

insert into public.waitlist (game_id, player_id, joined_at) values
  ('8e000000-0000-0000-0000-00000000000e', 'dddd0000-0000-0000-0000-0000000000f4', now() - interval '5 minutes');

select pg_temp.act_as('d0000000-0000-0000-0000-0000000000f4');
select pg_temp.ok(
  public.waitlist_position('8e000000-0000-0000-0000-00000000000e') = 1,
  'position counts only the queue for the game asked about');
reset role;

-- =============================================================================
-- authorization and disclosure
-- =============================================================================

-- Anonymous is stopped by the grant, one layer before the function body — the
-- game page renders for anon, but the position is a signed-in-only fact.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok(
  pg_temp.call_position('8f000000-0000-0000-0000-00000000000f') = 'denied',
  'an anonymous caller is denied execute on waitlist_position',
  pg_temp.call_position('8f000000-0000-0000-0000-00000000000f'));
reset role;

-- The function takes no player argument, so asking about someone else is
-- unrepresentable. What remains provable is that the direct read stays hidden:
-- C's own-row RLS still shows C exactly one row on a queue of three.
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000f3');
select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '8f000000-0000-0000-0000-00000000000f') = 1,
  'the underlying rows stay hidden — a player still reads only their own');
reset role;

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '8f000000-0000-0000-0000-00000000000f') = 3,
  'and the queue really did have three rows to be hidden');

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
