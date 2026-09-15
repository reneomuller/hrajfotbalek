-- =============================================================================
-- ROUND 35 v2, ITEM 4 — deleting a cancelled game, drilled.
--
-- Run:  node supabase/tests/run.mjs delete_cancelled_game
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

-- IT CANCELS A GAME, DELETES IT, AND READS THE LEDGER AFTERWARDS. All three
-- write; none of it belongs in a migration's verification block.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-0000000000e1', 'dcg-a@test.invalid'),
  ('60000000-0000-0000-0000-0000000000e2', 'dcg-b@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6eee0000-0000-0000-0000-0000000000e1', 'DelAdmin', 'dcg-a@test.invalid',
   '60000000-0000-0000-0000-0000000000e1', true),
  ('6eee0000-0000-0000-0000-0000000000e2', 'DelPlayer', 'dcg-b@test.invalid',
   '60000000-0000-0000-0000-0000000000e2', false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('9eee0000-0000-0000-0000-0000000000e1', 'Delete Me', now() + interval '30 hours', 12, 180, 'published'),
  ('9eee0000-0000-0000-0000-0000000000e2', 'Keep Me',   now() + interval '31 hours', 12, 180, 'published');

create function pg_temp.game_exists(p uuid) returns boolean language sql security definer as $$
  select exists (select 1 from public.games where id = p)
$$;

create function pg_temp.bal(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

-- =============================================================================
-- THE BUG, STATED AS THE ASSERTION IT IS: a LIVE booking still blocks
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000e2');
select public.create_booking('9eee0000-0000-0000-0000-0000000000e1', 'cash');
reset role;

select pg_temp.act_as('60000000-0000-0000-0000-0000000000e1');
select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000000e1')$q$,
  'raise:GAME_HAS_BOOKINGS',
  'a game with a LIVE booking is still refused — the guard was never the '
  'problem, only what it counted');
reset role;

select pg_temp.ok(
  pg_temp.game_exists('9eee0000-0000-0000-0000-0000000000e1'),
  'and the game is still there');

-- =============================================================================
-- AND AFTER CANCELLING, IT DELETES — which is what the refusal's own advice
-- told you to do and what used to change nothing at all
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000e1');
select public.cancel_game('9eee0000-0000-0000-0000-0000000000e1');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '9eee0000-0000-0000-0000-0000000000e1'
      and status = 'cancelled') = 1,
  'cancelling the game CANCELS the booking and leaves the row — which is the '
  'row the old guard kept counting');

create temp table _before as select pg_temp.bal('6eee0000-0000-0000-0000-0000000000e2') as bal;

select pg_temp.act_as('60000000-0000-0000-0000-0000000000e1');
select public.admin_delete_game('9eee0000-0000-0000-0000-0000000000e1');
reset role;

select pg_temp.ok(
  not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000000e1'),
  'THE CANCELLED GAME DELETES');

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '9eee0000-0000-0000-0000-0000000000e1') = 0,
  'and its cancelled bookings went with it');

-- =============================================================================
-- THE LEDGER OUTLIVES THE GAME, which is what makes this safe to allow
-- =============================================================================

select pg_temp.ok(
  pg_temp.bal('6eee0000-0000-0000-0000-0000000000e2') = (select bal from _before),
  'NO WALLET MOVED — deleting a game is not a refund and not a confiscation',
  pg_temp.bal('6eee0000-0000-0000-0000-0000000000e2')::text
    || ' vs ' || (select bal from _before)::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'game_deleted'
      and metadata ->> 'game_id' = '9eee0000-0000-0000-0000-0000000000e1') = 1,
  'the deletion is logged, and the log outlives the game it is about');

-- =============================================================================
-- A GAME NOBODY BOOKED STILL DELETES, unchanged
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000000e1');
select public.admin_delete_game('9eee0000-0000-0000-0000-0000000000e2');
reset role;

select pg_temp.ok(
  not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000000e2'),
  'an unbooked game deletes as it always did');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
