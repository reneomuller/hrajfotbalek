-- =============================================================================
-- ROUND 39, ITEM 1 — the delete guard counts obligations, not rows. Drilled.
--
-- Run:  node supabase/tests/run.mjs delete_game_obligations
--
-- THE PRODUCTION SHAPES, reproduced: a settled game whose only booking is a
-- legacy `reserved` hold nothing ever expired (the "no players" report), and a
-- settled game full of `confirmed` bookings (the "completed game" report).
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
  ('60000000-0000-0000-0000-0000000039a1', 'dgo-admin@test.invalid'),
  ('60000000-0000-0000-0000-0000000039a2', 'dgo-player@test.invalid'),
  ('60000000-0000-0000-0000-0000000039a3', 'dgo-other@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6eee0000-0000-0000-0000-0000000039a1', 'DgoAdmin', 'dgo-admin@test.invalid',
   '60000000-0000-0000-0000-0000000039a1', true),
  ('6eee0000-0000-0000-0000-0000000039a2', 'DgoPlayer', 'dgo-player@test.invalid',
   '60000000-0000-0000-0000-0000000039a2', false),
  ('6eee0000-0000-0000-0000-0000000039a3', 'DgoOther', 'dgo-other@test.invalid',
   '60000000-0000-0000-0000-0000000039a3', false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  -- upcoming, one CONFIRMED booking
  ('9eee0000-0000-0000-0000-0000000039b1', 'Upcoming Confirmed', now() + interval '3 days', 12, 180, 'published', 90),
  -- upcoming, one RESERVED booking (on the lineup, not yet paid)
  ('9eee0000-0000-0000-0000-0000000039b2', 'Upcoming Reserved',  now() + interval '3 days', 12, 180, 'published', 90),
  -- upcoming, nobody left: one cancelled row, one expired row
  ('9eee0000-0000-0000-0000-0000000039b3', 'Upcoming Stale',     now() + interval '3 days', 12, 180, 'published', 90),
  -- past and SETTLED, only a legacy reserved hold — the production "no players" game
  ('9eee0000-0000-0000-0000-0000000039b4', 'Settled Legacy Hold', now() - interval '50 days', 12, 180, 'settled', 90),
  -- past and SETTLED, two confirmed bookings, one credit-paid
  ('9eee0000-0000-0000-0000-0000000039b5', 'Settled Played',      now() - interval '20 days', 12, 180, 'settled', 90),
  -- past but never marked played: kicked off yesterday, still `published`
  ('9eee0000-0000-0000-0000-0000000039b6', 'Kicked Off',          now() - interval '1 day',  12, 180, 'published', 90),
  -- empty, upcoming
  ('9eee0000-0000-0000-0000-0000000039b7', 'Upcoming Empty',      now() + interval '3 days', 12, 180, 'published', 90);

insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk) values
  ('b0000000-0000-0000-0000-0000000039c1', '9eee0000-0000-0000-0000-0000000039b1', '6eee0000-0000-0000-0000-0000000039a2', 'confirmed', 'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c2', '9eee0000-0000-0000-0000-0000000039b2', '6eee0000-0000-0000-0000-0000000039a2', 'reserved',  'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c3', '9eee0000-0000-0000-0000-0000000039b3', '6eee0000-0000-0000-0000-0000000039a2', 'cancelled', 'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c4', '9eee0000-0000-0000-0000-0000000039b3', '6eee0000-0000-0000-0000-0000000039a3', 'expired',   'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c5', '9eee0000-0000-0000-0000-0000000039b4', '6eee0000-0000-0000-0000-0000000039a2', 'reserved',  'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c6', '9eee0000-0000-0000-0000-0000000039b5', '6eee0000-0000-0000-0000-0000000039a2', 'confirmed', 'credit', 180, 180),
  ('b0000000-0000-0000-0000-0000000039c7', '9eee0000-0000-0000-0000-0000000039b5', '6eee0000-0000-0000-0000-0000000039a3', 'confirmed', 'cash', 180, 0),
  ('b0000000-0000-0000-0000-0000000039c8', '9eee0000-0000-0000-0000-0000000039b6', '6eee0000-0000-0000-0000-0000000039a2', 'confirmed', 'cash', 180, 0);

-- The credit-paid seat on the settled game: a grant, then the redemption that
-- points at the booking. The redemption must SURVIVE the delete.
insert into public.credit_ledger (player_id, delta_czk, reason, booking_id) values
  ('6eee0000-0000-0000-0000-0000000039a2',  300, 'admin_grant', null),
  ('6eee0000-0000-0000-0000-0000000039a2', -150, 'redemption',  'b0000000-0000-0000-0000-0000000039c6');

create function pg_temp.game_exists(p uuid) returns boolean language sql security definer as $$
  select exists (select 1 from public.games where id = p)
$$;

create function pg_temp.bal(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

create temp table _before as
  select pg_temp.bal('6eee0000-0000-0000-0000-0000000039a2') as bal;

-- =============================================================================
-- STILL REFUSED: an upcoming game somebody is still booked on
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039a1');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b1')$q$,
  'raise:GAME_HAS_BOOKINGS',
  'an UPCOMING game with a CONFIRMED booking refuses — cancel-first protects that credit');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b2')$q$,
  'raise:GAME_HAS_BOOKINGS',
  'an UPCOMING game with a RESERVED booking refuses — he is on the lineup and would not be told');

-- =============================================================================
-- NOW DELETES: everything else
-- =============================================================================

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b3')$q$,
  'rows:1',
  'an upcoming game with only a cancelled and an expired row DELETES');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b4')$q$,
  'rows:1',
  'a SETTLED game whose only row is a legacy reserved hold DELETES — the production "no players" case');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b5')$q$,
  'rows:1',
  'a SETTLED game with confirmed bookings DELETES — the production "completed game" case');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b6')$q$,
  'rows:1',
  'a game that KICKED OFF but was never marked played deletes — past is past');

select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b7')$q$,
  'rows:1',
  'an empty upcoming game deletes, as it always did');

reset role;

select pg_temp.ok(
  pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b1')
  and pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b2'),
  'both refused games are still there');

select pg_temp.ok(
  not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b3')
  and not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b4')
  and not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b5')
  and not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b6')
  and not pg_temp.game_exists('9eee0000-0000-0000-0000-0000000039b7'),
  'every allowed game is gone');

-- =============================================================================
-- WHAT A PAST DELETE TAKES, AND WHAT IT LEAVES
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id in ('9eee0000-0000-0000-0000-0000000039b4',
                      '9eee0000-0000-0000-0000-0000000039b5')) = 0,
  'the past games'' bookings went with them, by cascade — out of history and stats');

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where player_id = '6eee0000-0000-0000-0000-0000000039a2'
      and reason = 'redemption' and booking_id is null and delta_czk = -150) = 1,
  'the redemption row SURVIVES, unlinked — ON DELETE SET NULL');

select pg_temp.ok(
  pg_temp.bal('6eee0000-0000-0000-0000-0000000039a2') = (select bal from _before),
  'NO WALLET MOVED',
  pg_temp.bal('6eee0000-0000-0000-0000-0000000039a2')::text || ' vs '
    || (select bal from _before)::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'game_deleted'
      and metadata ->> 'game_id' = '9eee0000-0000-0000-0000-0000000039b5'
      and metadata ->> 'status' = 'settled') = 1,
  'the deletion is logged with the status the game had');

-- =============================================================================
-- AND A PLAYER STILL CANNOT DELETE ANYTHING
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-0000000039a2');
select pg_temp.ok_probe(
  $q$select public.admin_delete_game('9eee0000-0000-0000-0000-0000000039b1')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin is refused before any status is read');
reset role;

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
