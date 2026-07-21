-- =============================================================================
-- Phase 17 assertions — join_waitlist
--
-- Run:  node supabase/tests/run.mjs join_waitlist
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000e1', 'wa@test.invalid'),
  ('b0000000-0000-0000-0000-0000000000e2', 'wb@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('aaaa0000-0000-0000-0000-0000000000e1', 'WaitPlayerA', 'wa@test.invalid', 'a0000000-0000-0000-0000-0000000000e1'),
  ('bbbb0000-0000-0000-0000-0000000000e2', 'WaitPlayerB', 'wb@test.invalid', 'b0000000-0000-0000-0000-0000000000e2');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9f000000-0000-0000-0000-00000000000f', 'Full Game',      now() + interval '7 days', 1, 200, 'full'),
  ('9e000000-0000-0000-0000-00000000000e', 'Published Game', now() + interval '7 days', 10, 200, 'published'),
  ('9d000000-0000-0000-0000-00000000000d', 'Draft Game',     now() + interval '7 days', 10, 200, 'draft'),
  ('9c000000-0000-0000-0000-00000000000c', 'Started Game',   now() + interval '7 days', 10, 200, 'full');

-- =============================================================================
-- happy path — row + event in one transaction
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000e1');
select public.join_waitlist('9f000000-0000-0000-0000-00000000000f');
reset role;

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '9f000000-0000-0000-0000-00000000000f'
      and player_id = 'aaaa0000-0000-0000-0000-0000000000e1') = 1,
  'joining a full game creates exactly one waitlist row');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_joined'
      and game_id = '9f000000-0000-0000-0000-00000000000f'
      and player_id = 'aaaa0000-0000-0000-0000-0000000000e1') = 1,
  'the same call wrote exactly one waitlist_joined event');

select pg_temp.ok(
  (select notified_at is null and converted_booking_id is null
     from public.waitlist
    where game_id = '9f000000-0000-0000-0000-00000000000f'
      and player_id = 'aaaa0000-0000-0000-0000-0000000000e1'),
  'a fresh join is un-notified and unconverted');

-- =============================================================================
-- dedupe by constraint, surfaced as already_joined rather than an error
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000e1');
select pg_temp.ok(
  (select already_joined from public.join_waitlist('9f000000-0000-0000-0000-00000000000f')),
  'a second join returns already_joined = true instead of raising');
reset role;

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '9f000000-0000-0000-0000-00000000000f'
      and player_id = 'aaaa0000-0000-0000-0000-0000000000e1') = 1,
  'the duplicate join created no second waitlist row');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_joined'
      and game_id = '9f000000-0000-0000-0000-00000000000f'
      and player_id = 'aaaa0000-0000-0000-0000-0000000000e1') = 1,
  'the duplicate join emitted no second waitlist_joined event');

-- =============================================================================
-- game-status gating
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000e2');
select pg_temp.ok_probe(
  $q$select public.join_waitlist('9e000000-0000-0000-0000-00000000000e')$q$,
  'raise:GAME_NOT_WAITLISTABLE',
  'joining a published game with free spots is rejected');

select pg_temp.ok_probe(
  $q$select public.join_waitlist('9d000000-0000-0000-0000-00000000000d')$q$,
  'raise:GAME_NOT_WAITLISTABLE',
  'joining a draft game is rejected');

select pg_temp.ok_probe(
  $q$select public.join_waitlist('00000000-0000-0000-0000-0000000000ff')$q$,
  'raise:GAME_NOT_FOUND',
  'joining a game that does not exist is rejected');
reset role;

-- A game that has kicked off takes no more waitlist joins.
update public.games set starts_at = now() - interval '1 hour'
 where id = '9c000000-0000-0000-0000-00000000000c';

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000e2');
select pg_temp.ok_probe(
  $q$select public.join_waitlist('9c000000-0000-0000-0000-00000000000c')$q$,
  'raise:GAME_ALREADY_STARTED',
  'joining a game that already kicked off is rejected');
reset role;

-- =============================================================================
-- authorization — identity comes from auth.uid()
-- =============================================================================

-- Anonymous is stopped one layer EARLIER than the function body: execute is
-- granted to authenticated and service_role only, so anon never reaches the
-- auth.uid() check. Asserting 'denied' rather than the raise records where the
-- gate actually is — claiming the in-function check caught this would be a test
-- passing for the wrong reason.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok_probe(
  $q$select public.join_waitlist('9f000000-0000-0000-0000-00000000000f')$q$,
  'denied',
  'an anonymous caller is denied execute on join_waitlist');
reset role;

-- The in-function check is what catches an authenticated session with no
-- player row — a user mid-signup who has a JWT but no identity yet.
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000e3');
select pg_temp.ok_probe(
  $q$select public.join_waitlist('9f000000-0000-0000-0000-00000000000f')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'an authenticated session with no player row is rejected in-function');
reset role;

-- Player B joining creates B's row, not A's — the function takes no player
-- argument at all, which is what makes acting-as-someone-else unrepresentable.
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000e2');
select public.join_waitlist('9f000000-0000-0000-0000-00000000000f');
reset role;

-- Matched by player rather than by joined_at: both rows carry the same
-- transaction timestamp, so ordering by it is nondeterministic here.
select pg_temp.ok(
  exists (select 1 from public.waitlist
           where game_id = '9f000000-0000-0000-0000-00000000000f'
             and player_id = 'bbbb0000-0000-0000-0000-0000000000e2'),
  'player B''s join is recorded against player B');

select pg_temp.ok(
  (select count(*) from public.waitlist
    where game_id = '9f000000-0000-0000-0000-00000000000f') = 2,
  'two distinct players hold two waitlist rows on the same game');

-- =============================================================================
-- same-transaction guarantee: a failure after the insert leaves neither
-- =============================================================================

do $$
declare v_before_rows integer; v_before_events integer;
        v_after_rows integer;  v_after_events integer;
begin
  select count(*) into v_before_rows   from public.waitlist;
  select count(*) into v_before_events from public.events where event_type = 'waitlist_joined';

  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'a0000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);
    -- Join a second full game, then force a failure inside the same statement's
    -- transaction scope.
    perform public.join_waitlist('9c000000-0000-0000-0000-00000000000c');
    raise exception 'FORCED_ROLLBACK';
  exception
    when others then null;
  end;
  reset role;

  select count(*) into v_after_rows   from public.waitlist;
  select count(*) into v_after_events from public.events where event_type = 'waitlist_joined';

  perform pg_temp.ok(
    v_after_rows = v_before_rows and v_after_events = v_before_events,
    'a forced failure after the insert leaves neither the row nor the event',
    format('rows %s->%s, events %s->%s', v_before_rows, v_after_rows, v_before_events, v_after_events));
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
