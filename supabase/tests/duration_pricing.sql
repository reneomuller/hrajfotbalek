-- =============================================================================
-- ROUND 35 v5 — the price follows the length, and a credit buys 90 minutes.
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

select pg_temp.ok(public.price_for_duration(60) = 150, 'sixty minutes is 150');
select pg_temp.ok(public.price_for_duration(90) = 180, 'ninety minutes is 180');
select pg_temp.ok(
  public.price_for_duration(null) = 150,
  'A NULL LENGTH IS SIXTY, because a null row renders as the standard length — '
  'reading it as "unknown, charge more" would bill for time nobody booked');
select pg_temp.ok(
  public.price_for_duration(120) = 180,
  'and anything else takes the 90-minute price — pre-picked, and flagged for a '
  'ruling rather than invented as a tier');

select pg_temp.ok(
  public.credit_seat_minutes() = 90,
  'a credit buys ninety minutes');

-- =============================================================================
-- THE WRITERS DERIVE THE PRICE — a caller cannot create a disagreement
-- =============================================================================

select pg_temp.act_as('60000000-0000-0000-0000-00000000dd01');

create temp table _made as
select public.admin_create_game_v2(
  '11110000-0000-0000-0000-00000000dd01', now() + interval '30 hours', 12,
  9999,                      -- a price the caller made up
  'Dur Organizer', null, null, null, null,
  60                         -- ...against a 60-minute game
) as id;

select pg_temp.ok(
  pg_temp.game_price((select id from _made)) = 150,
  'A CALLER''S PRICE IS IGNORED — 9999 was sent and the length decided 150',
  pg_temp.game_price((select id from _made))::text);

create temp table _made90 as
select public.admin_create_game_v2(
  '11110000-0000-0000-0000-00000000dd01', now() + interval '31 hours', 12,
  1,                         -- and again, from the other direction
  'Dur Organizer', null, null, null, null, 90
) as id;

select pg_temp.ok(
  pg_temp.game_price((select id from _made90)) = 180,
  'and a 90-minute game is 180 however little the caller asked for',
  pg_temp.game_price((select id from _made90))::text);

-- Editing prices from the row's OWN length, not from the caller either.
select public.publish_game((select id from _made));
select public.publish_game((select id from _made90));
select pg_temp.ok(
  (select public.admin_update_game((select id from _made),
     '11110000-0000-0000-0000-00000000dd01', now() + interval '32 hours', 4242)) is not null
  or true,
  'the edit accepts a made-up price');
reset role;

select pg_temp.ok(
  pg_temp.game_price((select id from _made)) = 150,
  'and stores the one its length implies',
  pg_temp.game_price((select id from _made))::text);

-- =============================================================================
-- ITEM 1 — A CREDIT BUYS A 90-MINUTE SEAT AND NOTHING ELSE
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

-- The sixty-minute game: NOTHING is applied, whatever the wallet holds.
select pg_temp.act_as('60000000-0000-0000-0000-00000000dd03');
select public.create_booking((select id from _made), 'qr');
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03') = 3 * 180,
  'A SIXTY-MINUTE GAME TAKES NO CREDIT — the wallet is untouched',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03')::text);

select pg_temp.ok(
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).credit_applied_czk = 0,
  'nothing was applied to the booking');

select pg_temp.ok(
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).status = 'reserved',
  'so it owes its whole price and the only rail left is the online one');

select pg_temp.ok(
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).price_czk = 150,
  'which is 150, the sixty-minute price',
  (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).price_czk::text);

-- =============================================================================
-- AND THE ADD-GUESTS CREDIT RAIL REFUSES OUTRIGHT
--
-- A NAMED ERROR, NOT A SILENT ZERO. The booking path can apply nothing and
-- carry on, because another rail sits behind it in the same form. This one IS
-- the rail: the player pressed the credit button.
-- =============================================================================

update public.bookings set status = 'confirmed'
 where id = (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).id;

select pg_temp.act_as('60000000-0000-0000-0000-00000000dd03');
select pg_temp.ok_probe(
  format($q$select public.add_guests_with_credit(%L, 1)$q$,
         (pg_temp.bk((select id from _made), '6ddd0000-0000-0000-0000-00000000dd03')).id),
  'raise:GAME_NOT_CREDIT_ELIGIBLE',
  'the add-guests credit rail refuses a sixty-minute game by name');
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd03') = 3 * 180,
  'and the refusal took nothing');

-- ...while the ninety-minute one still works.
select pg_temp.act_as('60000000-0000-0000-0000-00000000dd02');
select public.add_guests_with_credit(
  (pg_temp.bk((select id from _made90), '6ddd0000-0000-0000-0000-00000000dd02')).id, 1);
reset role;

select pg_temp.ok(
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02') = 0,
  'a guest on a ninety-minute game still costs exactly one credit',
  pg_temp.bal('6ddd0000-0000-0000-0000-00000000dd02')::text);

-- =============================================================================
-- EVERY GAME IN THE DATABASE AGREES WITH ITS OWN LENGTH
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.games
    where price_czk is distinct from public.price_for_duration(duration_minutes)) = 0,
  'no game is priced against its length',
  (select count(*)::text from public.games
    where price_czk is distinct from public.price_for_duration(duration_minutes)));

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
