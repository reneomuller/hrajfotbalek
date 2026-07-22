-- =============================================================================
-- Phase 25 assertions — grant_credit + merge_players
--
-- Run:  node supabase/tests/run.mjs admin_players_rpcs
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
-- `call()` consumes the value it selects (POLISH.md).
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

create function pg_temp.call(sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'select (' || sql || ')::text' into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || split_part(sqlerrm, ':', 1); end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.balance(p_player uuid)
returns integer language sql as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p_player;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000ad21', 'admin-p@test.invalid'),
  ('b0000000-0000-0000-0000-00000000b221', 'real-p@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000ad21', 'CreditAdmin', 'admin-p@test.invalid', 'a0000000-0000-0000-0000-00000000ad21', true),
  ('bbbb0000-0000-0000-0000-00000000b221', 'RealPlayer',  'real-p@test.invalid',  'b0000000-0000-0000-0000-00000000b221', false);

-- The shadow: no auth user, which is what makes it mergeable.
insert into public.players (id, nickname, email, auth_user_id) values
  ('cccc0000-0000-0000-0000-00000000c221', 'ShadowOne', null, null);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('66660000-0000-0000-0000-00000000e221', 'Merge Pitch',  now() + interval '6 days', 10, 200, 'published'),
  ('66660000-0000-0000-0000-00000000e222', 'Second Pitch', now() + interval '7 days', 10, 200, 'published');

-- =============================================================================
-- grant_credit
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');
select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 150)$q$,
  '150',
  'a grant returns the new balance');
reset role;

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-00000000b221') = 150,
  'the ledger row is what moved the balance');

select pg_temp.ok(
  (select reason = 'admin_grant' from public.credit_ledger
    where player_id = 'bbbb0000-0000-0000-0000-00000000b221' limit 1),
  'the ledger row is stamped admin_grant');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'credit_issued'
      and player_id = 'bbbb0000-0000-0000-0000-00000000b221') = 1,
  'the grant emitted exactly one credit_issued event');

-- --- unmatched payment: three writes, one transaction ------------------------

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');
select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 200, 'admin_grant', true, 'wrong VS');
reset role;

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'payment_unmatched'
      and player_id = 'bbbb0000-0000-0000-0000-00000000b221') = 1,
  'resolving an unmatched payment emits payment_unmatched');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'credit_issued'
      and player_id = 'bbbb0000-0000-0000-0000-00000000b221') = 2,
  'and the credit_issued event beside it');

do $$
declare v_ledger_before integer; v_events_before integer;
        v_ledger_after integer;  v_events_after integer;
begin
  select count(*) into v_ledger_before from public.credit_ledger;
  select count(*) into v_events_before from public.events
   where event_type in ('credit_issued', 'payment_unmatched');

  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'a0000000-0000-0000-0000-00000000ad21', 'role', 'authenticated')::text, true);
    perform public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 99, 'admin_grant', true, 'doomed');
    raise exception 'FORCED_ROLLBACK';
  exception when others then null;
  end;
  reset role;

  select count(*) into v_ledger_after from public.credit_ledger;
  select count(*) into v_events_after from public.events
   where event_type in ('credit_issued', 'payment_unmatched');

  perform pg_temp.ok(
    v_ledger_after = v_ledger_before and v_events_after = v_events_before,
    'a forced failure leaves none of the ledger row, credit_issued or payment_unmatched',
    format('ledger %s->%s, events %s->%s', v_ledger_before, v_ledger_after, v_events_before, v_events_after));
end $$;

-- --- guards -------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');

select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', -100000)$q$,
  'raise:CREDIT_NEGATIVE_BLOCKED',
  'a grant that would drive the balance below zero is refused');

select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 0)$q$,
  'raise:INVALID_CREDIT_DELTA',
  'a zero-value grant is refused');

select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 50, 'redemption')$q$,
  'raise:INVALID_CREDIT_REASON',
  'an admin cannot hand-write a redemption row');

select pg_temp.ok_call(
  $q$select public.grant_credit('00000000-0000-0000-0000-0000000000ff', 50)$q$,
  'raise:PLAYER_NOT_FOUND',
  'granting to a player who does not exist is refused');

-- A negative adjustment within the balance is legitimate.
select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', -50, 'adjustment')$q$,
  '300',
  'a negative adjustment inside the balance is allowed');

reset role;

select pg_temp.act_as('b0000000-0000-0000-0000-00000000b221');
select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 5000)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot mint credit for themselves');
reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select pg_temp.ok_call(
  $q$select public.grant_credit('bbbb0000-0000-0000-0000-00000000b221', 5000)$q$,
  'denied',
  'an anonymous caller is denied execute on grant_credit');
reset role;

-- =============================================================================
-- merge_players
-- =============================================================================

-- The shadow has a booking, a waitlist row, credit and events of its own.
insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk) values
  ('55550000-0000-0000-0000-00000000e221', '66660000-0000-0000-0000-00000000e221',
   'cccc0000-0000-0000-0000-00000000c221', 'cash', 'confirmed', 200);

insert into public.waitlist (game_id, player_id) values
  ('66660000-0000-0000-0000-00000000e222', 'cccc0000-0000-0000-0000-00000000c221');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');
select public.grant_credit('cccc0000-0000-0000-0000-00000000c221', 120);
reset role;

select pg_temp.ok(
  pg_temp.balance('cccc0000-0000-0000-0000-00000000c221') = 120
    and pg_temp.balance('bbbb0000-0000-0000-0000-00000000b221') = 300,
  'pre-merge balances are 120 (shadow) and 300 (surviving)');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');
select pg_temp.ok(
  public.merge_players('cccc0000-0000-0000-0000-00000000c221',
                       'bbbb0000-0000-0000-0000-00000000b221') > 0,
  'the merge reports the rows it moved');
reset role;

select pg_temp.ok(
  pg_temp.balance('bbbb0000-0000-0000-0000-00000000b221') = 420,
  'the merged balance is the sum of both pre-merge balances');

select pg_temp.ok(
  (select player_id = 'bbbb0000-0000-0000-0000-00000000b221' from public.bookings
    where id = '55550000-0000-0000-0000-00000000e221'),
  'the booking now belongs to the surviving player');

select pg_temp.ok(
  (select count(*) from public.waitlist
    where player_id = 'bbbb0000-0000-0000-0000-00000000b221'
      and game_id = '66660000-0000-0000-0000-00000000e222') = 1,
  'the waitlist row followed too');

select pg_temp.ok(
  (select count(*) from public.bookings   where player_id = 'cccc0000-0000-0000-0000-00000000c221') = 0
  and (select count(*) from public.waitlist      where player_id = 'cccc0000-0000-0000-0000-00000000c221') = 0
  and (select count(*) from public.credit_ledger where player_id = 'cccc0000-0000-0000-0000-00000000c221') = 0
  and (select count(*) from public.events        where player_id = 'cccc0000-0000-0000-0000-00000000c221') = 0,
  'zero rows in any of the four tables still reference the merged id');

select pg_temp.ok(
  (select count(*) from public.players where id = 'cccc0000-0000-0000-0000-00000000c221') = 0,
  'the shadow row itself is gone');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'player_claimed'
      and player_id = 'bbbb0000-0000-0000-0000-00000000b221'
      and metadata->>'source' = 'admin_merge') = 1,
  'the merge left a player_claimed event recording what happened');

-- --- guards -------------------------------------------------------------------

insert into public.players (id, nickname, auth_user_id) values
  ('dddd0000-0000-0000-0000-00000000d221', 'ShadowTwo', null),
  ('dddd0000-0000-0000-0000-00000000d222', 'ShadowTre', null);

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');

select pg_temp.ok_call(
  $q$select public.merge_players('dddd0000-0000-0000-0000-00000000d221', 'dddd0000-0000-0000-0000-00000000d221')$q$,
  'raise:MERGE_SELF',
  'merging a player into themselves is refused');

select pg_temp.ok_call(
  $q$select public.merge_players('dddd0000-0000-0000-0000-00000000d221', '00000000-0000-0000-0000-0000000000ff')$q$,
  'raise:PLAYER_NOT_FOUND',
  'an unknown surviving id is refused');

-- The real player has an auth user, so it may never be the one merged away.
select pg_temp.ok_call(
  $q$select public.merge_players('bbbb0000-0000-0000-0000-00000000b221', 'dddd0000-0000-0000-0000-00000000d221')$q$,
  'raise:NOT_A_SHADOW',
  'a player with an auth user cannot be merged away');

reset role;

-- Both identities active on the same game: refused with a sentence rather than
-- surfacing as the one-active-booking-per-game constraint.
insert into public.bookings (id, game_id, player_id, payment_method, status, price_czk) values
  ('55550000-0000-0000-0000-00000000e222', '66660000-0000-0000-0000-00000000e222',
   'dddd0000-0000-0000-0000-00000000d221', 'cash', 'reserved', 200),
  ('55550000-0000-0000-0000-00000000e223', '66660000-0000-0000-0000-00000000e222',
   'dddd0000-0000-0000-0000-00000000d222', 'cash', 'reserved', 200);

select pg_temp.act_as('a0000000-0000-0000-0000-00000000ad21');
select pg_temp.ok_call(
  $q$select public.merge_players('dddd0000-0000-0000-0000-00000000d221', 'dddd0000-0000-0000-0000-00000000d222')$q$,
  'raise:MERGE_CONFLICT',
  'two identities holding the same game are refused');
reset role;

select pg_temp.ok(
  (select count(*) from public.players where id = 'dddd0000-0000-0000-0000-00000000d221') = 1,
  'the refused merge changed nothing — the source player is still there');

select pg_temp.act_as('b0000000-0000-0000-0000-00000000b221');
select pg_temp.ok_call(
  $q$select public.merge_players('dddd0000-0000-0000-0000-00000000d221', 'bbbb0000-0000-0000-0000-00000000b221')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot merge identities');
reset role;

-- --- partial-failure rollback --------------------------------------------------

do $$
declare v_bookings_before integer; v_players_before integer;
        v_bookings_after integer;  v_players_after integer;
begin
  select count(*) into v_bookings_before from public.bookings
   where player_id = 'dddd0000-0000-0000-0000-00000000d221';
  select count(*) into v_players_before from public.players;

  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'a0000000-0000-0000-0000-00000000ad21', 'role', 'authenticated')::text, true);
    -- A merge that would otherwise succeed, failed after the fact.
    perform public.merge_players('dddd0000-0000-0000-0000-00000000d221',
                                 'bbbb0000-0000-0000-0000-00000000b221');
    raise exception 'FORCED_ROLLBACK';
  exception when others then null;
  end;
  reset role;

  select count(*) into v_bookings_after from public.bookings
   where player_id = 'dddd0000-0000-0000-0000-00000000d221';
  select count(*) into v_players_after from public.players;

  perform pg_temp.ok(
    v_bookings_after = v_bookings_before and v_players_after = v_players_before,
    'a failure partway through a merge leaves the database unchanged — no partial repoint',
    format('bookings %s->%s, players %s->%s',
           v_bookings_before, v_bookings_after, v_players_before, v_players_after));
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
