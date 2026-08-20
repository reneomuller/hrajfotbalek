-- =============================================================================
-- Round 12 item 5 assertions — the pending window, the webhook, the edges
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/online_payment_pending.sql
--
-- Transaction-wrapped and rolled back.
--
-- THE PROPERTY UNDER TEST IS A SEAT THAT STOPS BEING HELD WITHOUT ANYTHING
-- HAPPENING. There is no sweep and no status change: a pending booking simply
-- falls out of the seat count when its clock runs out. Nothing errors when
-- that goes wrong in either direction — a seat held forever looks like a busy
-- game, and a seat released too early looks like someone cancelled — so every
-- assertion here is a number or a named outcome.
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

/*
 * Booking ids, resolved by the OWNER.
 *
 * SECURITY DEFINER for the same reason `pg_temp.ok` is: the assertions below
 * run as `service_role` and as `authenticated`, and neither is granted SELECT
 * on `bookings` — that is the product's RLS working, not a gap. Without this
 * the suite would be asserting its own inability to read a table rather than
 * anything about payments.
 */
create function pg_temp.bid(p_game uuid, p_player uuid)
returns uuid language sql security definer as $$
  select b.id from public.bookings b
   where b.game_id = p_game and b.player_id = p_player
   order by b.created_at desc limit 1;
$$;

/*
 * Column readers, also SECURITY DEFINER, for the same reason as `bid`. Direct
 * SELECTs on `bookings` from `service_role` or `authenticated` are denied, and
 * that denial is the product's design rather than something to work around
 * with a grant added for a test.
 */
create function pg_temp.attention_reason(p_booking uuid)
returns text language sql security definer as $$
  select b.payment_attention_reason from public.bookings b where b.id = p_booking;
$$;

create function pg_temp.booking_status(p_booking uuid)
returns text language sql security definer as $$
  select b.status::text from public.bookings b where b.id = p_booking;
$$;

/* Ages a pending booking past its window, as the owner. */
create function pg_temp.age_out(p_booking uuid)
returns void language sql security definer as $$
  update public.bookings
     set payment_pending_at = now() - public.online_payment_window() - interval '1 minute'
   where id = p_booking;
$$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

/*
 * THE ACTUAL `service_role` DATABASE ROLE, not `authenticated` wearing a
 * service-role claim.
 *
 * Most RPCs in this codebase are granted to `authenticated, service_role` and
 * do the real check inside with `is_service_role()`, so the other suites can
 * fake it with a claim alone. `confirm_online_payment` is granted to
 * `service_role` ONLY — it exists for one caller, the webhook, and the EXECUTE
 * grant is a second lock in front of the internal check. A claim alone
 * therefore gets `permission denied`, which is the grant doing its job, so the
 * test has to become the role.
 */
create function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000071', 'op-a@test.invalid'),
  ('70000000-0000-0000-0000-000000000072', 'op-b@test.invalid');

insert into public.players (id, nickname, email, auth_user_id) values
  ('7aaa0000-0000-0000-0000-00000000000a', 'OpPlayerA', 'op-a@test.invalid', '70000000-0000-0000-0000-000000000071'),
  ('7bbb0000-0000-0000-0000-00000000000b', 'OpPlayerB', 'op-b@test.invalid', '70000000-0000-0000-0000-000000000072');

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('97770000-0000-0000-0000-000000000001', 'Online Cap Four', now() + interval '7 days', 4, 150, 'published'),
  ('97770000-0000-0000-0000-000000000002', 'Online Cap Two',  now() + interval '8 days', 2, 150, 'published');

-- =============================================================================
-- the window
-- =============================================================================

select pg_temp.act_as('70000000-0000-0000-0000-000000000071');

-- A party of two, online: two seats, marked pending.
select pg_temp.ok(
  (select (public.create_booking(
     '97770000-0000-0000-0000-000000000001', 'qr', null, null, 1, true)).price_czk) = 300,
  'an online party is priced whole, like any other');

reset role;

select pg_temp.ok(
  (select b.payment_pending_at is not null from public.bookings b
    where b.id = pg_temp.bid('97770000-0000-0000-0000-000000000001',
                             '7aaa0000-0000-0000-0000-00000000000a')),
  'an online booking is marked as awaiting payment');

select pg_temp.ok(
  public.game_seats_taken('97770000-0000-0000-0000-000000000001') = 2,
  'inside the window it holds its seats');

-- Age it past the window. Nothing else happens: no sweep, no status change.
select pg_temp.age_out(
  pg_temp.bid('97770000-0000-0000-0000-000000000001',
              '7aaa0000-0000-0000-0000-00000000000a'));

select pg_temp.ok(
  public.game_seats_taken('97770000-0000-0000-0000-000000000001') = 0,
  'past the window it stops holding them, with no sweep and no cron');

select pg_temp.ok(
  pg_temp.booking_status(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7aaa0000-0000-0000-0000-00000000000a')) = 'reserved',
  'and its STATUS is untouched, so every existing reader stays correct');

set role anon;
select pg_temp.ok(
  (select count(*) from public.game_roster_public
    where game_id = '97770000-0000-0000-0000-000000000001') = 0,
  'the roster stops showing a stale pending''s seats too');
reset role;

-- =============================================================================
-- cash, credit and bank-QR are untouched
-- =============================================================================

select pg_temp.act_as('70000000-0000-0000-0000-000000000072');

select pg_temp.ok(
  (select (public.create_booking(
     '97770000-0000-0000-0000-000000000002', 'cash')).id) is not null,
  'a cash booking still books');

reset role;

select pg_temp.ok(
  (select b.payment_pending_at is null from public.bookings b
    where b.id = pg_temp.bid('97770000-0000-0000-0000-000000000002',
                             '7bbb0000-0000-0000-0000-00000000000b')),
  'a CASH booking is never marked pending, so nothing about it expires');

-- The bank-QR rail is R3's substrate and a transfer takes days, not minutes.
-- `p_online` defaulting to false is what protects it.
select pg_temp.ok(
  (select b.payment_pending_at is null from public.bookings b
    where b.id = pg_temp.bid('97770000-0000-0000-0000-000000000002',
                             '7bbb0000-0000-0000-0000-00000000000b')),
  'a qr booking made without p_online is not on a thirty-minute clock');

-- =============================================================================
-- the webhook's entry point
-- =============================================================================

-- An ordinary player must never be able to confirm their own payment.
select pg_temp.act_as('70000000-0000-0000-0000-000000000071');

select pg_temp.ok_probe(
  $$select public.confirm_online_payment(
      pg_temp.bid('97770000-0000-0000-0000-000000000001',
                  '7aaa0000-0000-0000-0000-00000000000a'), 'cs_forged', 300)$$,
  /*
   * `denied`, NOT `raise:INSUFFICIENT_PERMISSION`, and the difference is the
   * point. Every other admin RPC here is granted to `authenticated` and
   * refuses inside itself, so a player reaches the function and is turned
   * away. This one is granted to `service_role` ONLY, so the caller never
   * reaches it — Postgres refuses at the grant.
   *
   * Two locks, and this assertion proves the OUTER one. The inner
   * `is_service_role()` check is still there and still necessary: the grant
   * says who may call, and the check says who may act.
   */
  'denied',
  'a signed-in player cannot confirm their own online payment');

reset role;
select pg_temp.act_as_service();

select pg_temp.ok(
  public.confirm_online_payment(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7aaa0000-0000-0000-0000-00000000000a'),
    'cs_live_1', 300) = 'confirmed',
  'a paid session confirms the booking, even after the window closed, when a seat is free');

select pg_temp.ok(
  public.game_seats_taken('97770000-0000-0000-0000-000000000001') = 2,
  'confirming puts the seats back');

-- IDEMPOTENCY. Stripe retries until it gets a 2xx and may deliver twice anyway.
select pg_temp.ok(
  public.confirm_online_payment(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7aaa0000-0000-0000-0000-00000000000a'),
    'cs_live_1', 300) = 'already',
  'the same session delivered twice is a no-op, not a second confirmation');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'payment_confirmed'
      and booking_id = pg_temp.bid('97770000-0000-0000-0000-000000000001',
                                   '7aaa0000-0000-0000-0000-00000000000a')) = 1,
  'and it wrote exactly one payment_confirmed event, not two');

-- A reference that names nothing is normal: a Payment Link is a public URL.
select pg_temp.ok(
  public.confirm_online_payment(
    '00000000-0000-0000-0000-000000000000', 'cs_ghost', 150) = 'unknown',
  'an unknown reference is reported, not raised — Stripe must not retry it');

select pg_temp.ok_probe(
  $$select public.confirm_online_payment(
      '00000000-0000-0000-0000-000000000000', '', 150)$$,
  'raise:INVALID_SESSION',
  'a blank session id is refused');

reset role;

-- =============================================================================
-- underpayment, and the seat that went away
-- =============================================================================

select pg_temp.act_as('70000000-0000-0000-0000-000000000072');
select pg_temp.ok(
  (select (public.create_booking(
     '97770000-0000-0000-0000-000000000001', 'qr', null, null, 1, true)).id) is not null,
  'a second party books the rest of the pitch');
reset role;

select pg_temp.act_as_service();

select pg_temp.ok(
  public.confirm_online_payment(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7bbb0000-0000-0000-0000-00000000000b'),
    'cs_short', 10) = 'attention',
  'an underpaid party is flagged, never seated');

select pg_temp.ok(
  pg_temp.attention_reason(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7bbb0000-0000-0000-0000-00000000000b')) like 'paid 10 CZK%',
  'and the reason records the shortfall for the person who resolves it');

select pg_temp.ok(
  pg_temp.booking_status(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7bbb0000-0000-0000-0000-00000000000b')) = 'reserved',
  'an underpaid booking is not confirmed');

reset role;

-- =============================================================================
-- retry
-- =============================================================================

-- The pitch is full (2 + 2 of 4). A retry cannot re-hold what is gone.
select pg_temp.age_out(
  pg_temp.bid('97770000-0000-0000-0000-000000000001',
              '7bbb0000-0000-0000-0000-00000000000b'));

select pg_temp.act_as('70000000-0000-0000-0000-000000000072');

-- ...but with its own seats released the game has room again, so this one CAN.
select pg_temp.ok(
  public.retry_online_payment(
    pg_temp.bid('97770000-0000-0000-0000-000000000001',
                '7bbb0000-0000-0000-0000-00000000000b')) = true,
  'a retry re-holds the seats when the room is still there');

reset role;

select pg_temp.ok(
  public.game_seats_taken('97770000-0000-0000-0000-000000000001') = 4,
  'and the game is full again');

-- Somebody else's booking is not retryable.
select pg_temp.act_as('70000000-0000-0000-0000-000000000071');

select pg_temp.ok_probe(
  $$select public.retry_online_payment(
      pg_temp.bid('97770000-0000-0000-0000-000000000001',
                  '7bbb0000-0000-0000-0000-00000000000b'))$$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot retry somebody else''s payment');

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
