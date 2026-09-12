-- =============================================================================
-- ROUND 29 — AUTO-SETTLE, drilled.
--
-- Run:  node supabase/tests/run.mjs auto_settle
--
-- THIS DRILL USED TO LIVE IN THE MIGRATION, and on 2026-09-12 it was applied to
-- production and COMMITTED — leaving a fake venue, two fake games, two bookings
-- against a real player, a real no-show notification in his bell, inflated
-- stats and 150 CZK of phantom money owed. `run.mjs` wraps every suite in
-- `begin; … rollback;` BY DESIGN, so the same fixtures here cannot escape.
-- A migration asserts SHAPE; behaviour is asserted in this directory.
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

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000a5e01', 'as1@test.invalid'),
  ('a0000000-0000-0000-0000-0000000a5e02', 'as2@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-0000000a5e01', 'SweepAdmin', 'as1@test.invalid',
   'a0000000-0000-0000-0000-0000000a5e01', true),
  ('aaaa0000-0000-0000-0000-0000000a5e02', 'SweepPlayer', 'as2@test.invalid',
   'a0000000-0000-0000-0000-0000000a5e02', false);

-- A CLEAN game: kicked off, paid booking, nothing holding it open.
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('9a000000-0000-0000-0000-0000000a5e01', 'Sweep Clean',
   now() - interval '6 hours', 10, 150, 'published', 60);
insert into public.bookings (game_id, player_id, status, payment_method, price_czk,
                             credit_applied_czk, guest_count)
  values ('9a000000-0000-0000-0000-0000000a5e01', 'aaaa0000-0000-0000-0000-0000000a5e02',
          'confirmed', 'qr', 150, 0, 0);

-- A HELD game: kicked off, but carrying an unpaid `reserved` row.
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('9a000000-0000-0000-0000-0000000a5e02', 'Sweep Held',
   now() - interval '6 hours', 10, 150, 'published', 60);
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk,
                             credit_applied_czk, guest_count)
  values ('7a000000-0000-0000-0000-0000000a5e02', '9a000000-0000-0000-0000-0000000a5e02',
          'aaaa0000-0000-0000-0000-0000000a5e02', 'reserved', 'cash', 150, 0, 0);

-- An EARLY game: kicked off half an hour ago, still inside its buffer.
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('9a000000-0000-0000-0000-0000000a5e03', 'Sweep Early',
   now() - interval '30 minutes', 10, 150, 'published', 60);

create function pg_temp.ledger_count() returns integer language sql security definer as $$
  select count(*)::integer from public.credit_ledger;
$$;
create function pg_temp.live_bookings() returns integer language sql security definer as $$
  select count(*)::integer from public.bookings where status in ('reserved','confirmed');
$$;
create temp table _before as
  select pg_temp.ledger_count() as ledger, pg_temp.live_bookings() as live;

/*
 * SECURITY DEFINER, AND THAT IS THE POINT. `bookings` is own-row for
 * `authenticated`, so a bare subselect run under `act_as(admin)` returns NULL
 * for a booking the admin does not own — and the RPC then raises
 * BOOKING_NOT_FOUND about a row that plainly exists. Resolve ids OUT of the
 * role, pass them IN.
 */
create function pg_temp.booking_of(p_game uuid)
returns uuid language sql security definer as $$
  select b.id from public.bookings b where b.game_id = p_game limit 1;
$$;

-- =============================================================================
-- authorization
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000a5e02');
select pg_temp.ok_probe(
  $q$select public.advance_played_games(120)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot run the sweep');
reset role;

-- =============================================================================
-- the forward path — one sweep, all the way
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000a5e01');
create temp table _out as select public.advance_played_games(120) as j;
reset role;

select pg_temp.ok(
  (select status = 'settled' from public.games where id = '9a000000-0000-0000-0000-0000000a5e01'),
  'one sweep takes a clean game published -> played -> settled',
  (select status::text from public.games where id = '9a000000-0000-0000-0000-0000000a5e01'));

select pg_temp.ok(
  (select (j ->> 'settled')::integer >= 1 from _out),
  'the sweep reports what it settled',
  (select j::text from _out));

-- =============================================================================
-- the tripwire — skips, does not raise, and names the game
-- =============================================================================

select pg_temp.ok(
  (select status = 'played' from public.games where id = '9a000000-0000-0000-0000-0000000a5e02'),
  'an unpaid hold keeps its game at played',
  (select status::text from public.games where id = '9a000000-0000-0000-0000-0000000a5e02'));

select pg_temp.ok(
  (select (j ->> 'skipped')::integer >= 1 from _out),
  'the skip is reported rather than raised');

select pg_temp.ok(
  (select (j -> 'skippedGameIds') ? '9a000000-0000-0000-0000-0000000a5e02' from _out),
  'the skipped game is named by id',
  (select j ->> 'skippedGameIds' from _out));

-- A game still inside its buffer is untouched by either half.
select pg_temp.ok(
  (select status = 'published' from public.games where id = '9a000000-0000-0000-0000-0000000a5e03'),
  'a game still inside its buffer is left alone');

-- =============================================================================
-- the money invariant — round 24's, now guarding a sweep that settles
-- =============================================================================

select pg_temp.ok(
  pg_temp.ledger_count() = (select ledger from _before),
  'the sweep moved no money',
  pg_temp.ledger_count()::text || ' vs ' || (select ledger from _before)::text);

select pg_temp.ok(
  pg_temp.live_bookings() = (select live from _before),
  'the sweep moved no bookings');

-- =============================================================================
-- resolving the hold lets a LATER sweep close it
--
-- The half that makes the tripwire safe rather than a trap: the settle pass
-- looks at every `played` game past its buffer, not only the ones it advanced.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000a5e01');
select public.confirm_booking('7a000000-0000-0000-0000-0000000a5e02');
select public.advance_played_games(120);
reset role;

select pg_temp.ok(
  (select status = 'settled' from public.games where id = '9a000000-0000-0000-0000-0000000a5e02'),
  'a later sweep closes the game once the hold is resolved',
  (select status::text from public.games where id = '9a000000-0000-0000-0000-0000000a5e02'));

-- =============================================================================
-- idempotence, and attendance after the books close
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000a5e01');
select public.advance_played_games(120);
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'game_settled'
      and game_id = '9a000000-0000-0000-0000-0000000a5e01') = 1,
  'a second sweep does not settle an already-settled game twice');

/*
 * THE OWNER'S RULE. `mark_attendance` gates on the BOOKING's status, never the
 * game's — which is the fact that made automating settlement possible at all.
 * A late no-show mark must still land on a settled game.
 */
select pg_temp.act_as('a0000000-0000-0000-0000-0000000a5e01');
select public.mark_attendance(
  pg_temp.booking_of('9a000000-0000-0000-0000-0000000a5e01'), 'no_show');
reset role;

select pg_temp.ok(
  (select attendance = 'no_show' from public.bookings
    where id = pg_temp.booking_of('9a000000-0000-0000-0000-0000000a5e01')),
  'attendance is still editable after the sweep has settled the game');

-- =============================================================================
-- manual settling is gone from the database, not merely from the page
-- =============================================================================

select pg_temp.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'settle_game'),
  'settle_game is dropped');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
