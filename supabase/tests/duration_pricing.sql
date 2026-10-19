-- =============================================================================
-- ROUND 35 v5 — the price follows the length, and a credit buys 90 minutes.
-- ROUND 40 — ~~and a credit buys 90 minutes~~: a game of ANY length is one
-- Credit, and every length prefills the Credit price. The 150 CZK hour is gone.
--
-- Run:  node supabase/tests/run.mjs duration_pricing
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

-- IT BOOKS, SPENDS AND REFUSES. None of it belongs in a migration's
-- verification block; `run.mjs` rolls the whole file back.

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-00000000dd01', 'dp-a@test.invalid'),
  ('60000000-0000-0000-0000-00000000dd02', 'dp-b@test.invalid'),
  ('60000000-0000-0000-0000-00000000dd03', 'dp-c@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('6ddd0000-0000-0000-0000-00000000dd01', 'DurAdmin',  'dp-a@test.invalid', '60000000-0000-0000-0000-00000000dd01', true),
  ('6ddd0000-0000-0000-0000-00000000dd02', 'DurNinety', 'dp-b@test.invalid', '60000000-0000-0000-0000-00000000dd02', false),
  ('6ddd0000-0000-0000-0000-00000000dd03', 'DurSixty',  'dp-c@test.invalid', '60000000-0000-0000-0000-00000000dd03', false);

insert into public.venues (id, name) values
  ('11110000-0000-0000-0000-00000000dd01', 'Duration Pitch');

create function pg_temp.bal(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

create function pg_temp.game_price(p uuid) returns integer language sql security definer as $$
  select price_czk from public.games where id = p
$$;

create function pg_temp.bk(p_game uuid, p_player uuid) returns public.bookings
language sql security definer as $$
  select * from public.bookings where game_id = p_game and player_id = p_player
     and status in ('reserved', 'confirmed') limit 1
$$;

-- =============================================================================
-- THE MAPPING
-- =============================================================================

select pg_temp.ok(public.price_for_duration(60) = 180,
  'sixty minutes prefills 180 — ~~150~~, removed by the owner in round 40');
select pg_temp.ok(public.price_for_duration(90) = 180, 'ninety minutes is 180');
select pg_temp.ok(public.price_for_duration(null) = 180, 'so is a null length');
select pg_temp.ok(public.price_for_duration(120) = 180, 'and so is anything else');
select pg_temp.ok(
  public.price_for_duration(60) = public.credit_seat_price_czk(),
  'because a game IS one Credit — the prefill is the Credit price, called, not copied');

-- =============================================================================
-- THE WRITERS STORE THE PRICE THEY ARE SENT (round 36, item 2)
--
-- ~~THE WRITERS DERIVE THE PRICE — a caller cannot create a disagreement.~~
-- The mapping is a DEFAULT the form prefills with, not a law the database
-- enforces. These two fixtures are priced deliberately ACROSS the mapping —
-- a 60-minute game at the credit-seat price, a 90-minute game at the 60-minute
-- one — so that everything below about credit eligibility is proved to key on
-- the DURATION and not on the number in `price_czk`. If eligibility ever
-- quietly started reading the price, these prices are the ones that would
-- catch it.
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-00000000dd01');

create temp table _made as
select public.admin_create_game_v2(
  '11110000-0000-0000-0000-00000000dd01', now() + interval '30 hours', 12,
  180,                       -- the CREDIT-SEAT price, typed by the organizer
  'Dur Organizer', null, null, null, null,
  60                         -- ...against a 60-minute game, which prefills 150
) as id;

select pg_temp.ok(
  pg_temp.game_price((select id from _made)) = 180,
  'THE TYPED PRICE IS STORED — 180 was sent against a 60-minute game and stuck',
  pg_temp.game_price((select id from _made))::text);

create temp table _made90 as
select public.admin_create_game_v2(
  '11110000-0000-0000-0000-00000000dd01', now() + interval '31 hours', 12,
  150,                       -- and again, from the other direction
  'Dur Organizer', null, null, null, null, 90
) as id;

select pg_temp.ok(
  pg_temp.game_price((select id from _made90)) = 150,
  'and a 90-minute game keeps the 150 it was given, prefill notwithstanding',
  pg_temp.game_price((select id from _made90))::text);

-- AND THE EDIT STORES WHAT IT IS HANDED TOO — through `admin_update_game_v2`,
-- WHICH IS THE ONE THE ADMIN FORM ACTUALLY CALLS.
--
-- ~~`admin_update_game`.~~ The old assertion drove the SEVEN-ARGUMENT legacy
-- function, which nothing in `app/` has called since the v2 overload landed, so
-- it proved nothing about the edit form either way.
--
-- AND IT PROVED IT BY NOT RUNNING. The call sat inside `(…) is not null or
-- true`, and Postgres folds `X or true` to `true` without evaluating X — the
-- same pruning trap as the `count(*)` probe in CLAUDE.md, wearing a different
-- hat. The update never executed; the price it "confirmed" was the one the
-- CREATE had already written. The call is now its own statement, where nothing
-- can optimise it away.
select public.publish_game((select id from _made));
select public.publish_game((select id from _made90));

select public.admin_update_game_v2(
  (select id from _made), '11110000-0000-0000-0000-00000000dd01',
  now() + interval '32 hours',
  4242,                      -- a price no mapping would ever produce
  'Dur Organizer', null, null, null, null,
  60                         -- ...and the length is unchanged at 60
);
reset role;

select pg_temp.ok(
  pg_temp.game_price((select id from _made)) = 4242,
  'THE EDIT STORES EXACTLY WHAT WAS TYPED — 4242, against a 60-minute row',
  pg_temp.game_price((select id from _made))::text);

-- ~~ITEM 1 — A CREDIT BUYS A 90-MINUTE SEAT AND NOTHING ELSE~~
-- ROUND 40 — A CREDIT PAYS FOR A GAME OF ANY LENGTH, AT ANY PRICE
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason) values
  ('6ddd0000-0000-0000-0000-00000000dd02', 3 * 180, 'admin_grant'),
  ('6ddd0000-0000-0000-0000-00000000dd03', 3 * 180, 'admin_grant');

-- The ninety-minute game: credit applies, one per seat.
select pg_temp.act_as('60000000-0000-0000-0000-00000000dd02');
select public.create_booking((select id from _made90), 'cash', null, null, 1);
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02') = 180,
  'two seats at ninety minutes spend two credits',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02')::text);

select pg_temp.ok(
  (pg_temp.bk((select id from _made90), '6ddd0000-0000-0000-0000-00000000dd02')).status = 'confirmed',
  'and the booking is settled');

-- The sixty-minute game, priced 4242 by its organizer: ONE Credit, all the same.
select pg_temp.act_as('60000000-0000-0000-0000-00000000dd03');
select public.create_booking((select id from _made), 'cash', null, null, 0);
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03') = 2 * 180,
  'A SIXTY-MINUTE GAME TAKES ONE CREDIT — ~~no credit at all~~ ended in round 40',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03')::text);

select pg_temp.ok(
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).credit_applied_czk = 180
  and (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).status = 'confirmed',
  'flat at the Credit rate whatever the card price is, and settled');

-- =============================================================================
-- AND THE ADD-GUESTS CREDIT RAIL TAKES IT TOO
--
-- ~~refuses a sixty-minute game by name~~ — GAME_NOT_CREDIT_ELIGIBLE is gone
-- with the rule it named.
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-00000000dd03');
select public.add_guests_with_credit(
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).id, 1);
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03') = 180,
  'a guest on a sixty-minute game costs exactly one credit',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03')::text);

select pg_temp.act_as('60000000-0000-0000-0000-00000000dd02');
select public.add_guests_with_credit(
  (pg_temp.bk((select id from _made90), '6ddd0000-0000-0000-0000-00000000dd02')).id, 1);
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02') = 0,
  'and so does one on a ninety-minute game',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02')::text);

-- =============================================================================
-- THE PRICE IS NOBODY'S BUSINESS BUT THE CARD RAIL'S (round 36, item 2)
--
-- Both fixtures are priced across the prefill, and a Credit still bought each
-- seat at exactly one Credit.
-- =============================================================================

select pg_temp.ok(
  pg_temp.game_price((select id from _made90)) <> public.price_for_duration(90)
  and pg_temp.game_price((select id from _made)) <> public.price_for_duration(60),
  'BOTH FIXTURES ARE PRICED OFF THE PREFILL — otherwise everything above is a '
  'test of a coincidence',
  pg_temp.game_price((select id from _made))::text || ' / '
  || pg_temp.game_price((select id from _made90))::text);

select pg_temp.ok(
  (select count(*) from public.bookings
    where credit_applied_czk > 0
      and credit_applied_czk % public.credit_seat_price_czk() <> 0) = 0,
  'and every credit that WAS applied came in whole seats — flat at 180 each, '
  'unmoved by a game priced at 150 or at 4242',
  (select count(*)::text from public.bookings
    where credit_applied_czk > 0
      and credit_applied_czk % public.credit_seat_price_czk() <> 0));

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
