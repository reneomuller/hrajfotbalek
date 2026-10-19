-- =============================================================================
-- ROUND 40 — the lawyer's terms, drilled.
--
-- Every game is bought as a Credit (Obchodní podmínky 5.1). A Credit is valid
-- sixty days from the day it was paid for (5.4), comes back with that validity
-- when the player cancels at least twelve hours ahead (9.1), and comes back
-- seven days longer when WE cancel the game (11.3). Consent is recorded per
-- tick (Texty 2.4).
--
-- Run:  node supabase/tests/run.mjs credits_sixty_days
-- =============================================================================
begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, coalesce(cond, false), detail);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
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
  -- `count(_p::text)`, never `count(*)` — see cancel_guests.sql.
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

create function pg_temp.booking_of(p_game uuid, p_player uuid)
returns uuid language sql security definer as $$
  select id from public.bookings
   where game_id = p_game and player_id = p_player
   order by created_at desc
   limit 1
$$;

create function pg_temp.balance(p uuid) returns integer language sql security definer as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger where player_id = p
$$;

-- Every refund row this player received, newest last.
create function pg_temp.refunds(p uuid)
returns setof public.credit_ledger language sql security definer as $$
  select * from public.credit_ledger
   where player_id = p and reason = 'cancellation_credit'
   order by created_at, id
$$;

-- --- fixtures ----------------------------------------------------------------
--
-- EVERY ASSERTION HERE MOVES MONEY, and `run.mjs` rolls the whole file back.
-- Inside one transaction `now()` is a constant, so every expiry below is
-- asserted EXACTLY rather than within a tolerance.

insert into auth.users (id, email)
select ('40000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r40-' || n || '@test.invalid'
  from generate_series(1, 12) n;

insert into public.players (id, nickname, email, auth_user_id)
select ('4ccc0000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'Round40P' || n,
       'r40-' || n || '@test.invalid',
       ('40000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 12) n;

-- TWELVE HOURS IS THE CUTOFF, so thirty is in time and eleven is late — and
-- eleven was IN time under the old eight-hour rule, which is what makes the
-- late assertion below fail before this round and pass after it.
insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94000000-0000-0000-0000-0000000000a1', 'R40 Card In Time',  now() + interval '30 hours', 12, 180, 'published', 90),
  ('94000000-0000-0000-0000-0000000000a2', 'R40 Card Late',     now() + interval '11 hours', 12, 180, 'published', 90),
  ('94000000-0000-0000-0000-0000000000a3', 'R40 Sixty Minutes', now() + interval '30 hours', 12, 180, 'published', 60),
  ('94000000-0000-0000-0000-0000000000a4', 'R40 We Cancel',     now() + interval '30 hours', 12, 180, 'published', 90),
  ('94000000-0000-0000-0000-0000000000a5', 'R40 Not Bookable',  now() + interval '30 hours', 12, 180, 'draft',     90),
  ('94000000-0000-0000-0000-0000000000a6', 'R40 Guests Card',   now() + interval '30 hours', 12, 180, 'published', 90),
  ('94000000-0000-0000-0000-0000000000a7', 'R40 Guests Credit', now() + interval '30 hours', 12, 180, 'published', 90);

-- A card payment arrives the way production's does: a registered session,
-- settled by the webhook's service-role call.
create function pg_temp.pay_by_card(p_session text, p_game uuid, p_player uuid,
                                    p_guests integer, p_amount integer)
returns text language plpgsql as $$
declare r text;
begin
  insert into public.checkout_sessions
         (stripe_session_id, game_id, player_id, guest_count, amount_czk, status)
  values (p_session, p_game, p_player, p_guests, p_amount, 'open');
  perform pg_temp.act_as_service();
  r := public.settle_checkout_session(p_session, p_amount);
  reset role;
  return r;
end $$;

-- =============================================================================
-- THE POLICY VALUES — one place each, in SQL
-- =============================================================================

select pg_temp.ok(public.credit_validity_days() = 60,
  'a Credit is valid sixty days (Podmínky 5.4)');
select pg_temp.ok(public.cancelled_game_extension_days() = 7,
  'a game WE cancel adds seven days (Podmínky 11.3)');
select pg_temp.ok(public.cancellation_refund_cutoff_hours() = 12,
  'the refund cutoff is twelve hours (Podmínky 9.1)');
select pg_temp.ok(
  public.price_for_duration(60) = 180 and public.price_for_duration(90) = 180
  and public.price_for_duration(120) = 180 and public.price_for_duration(null) = 180,
  'every length prefills the same price — a game is one Credit, and the 150 is gone');
select pg_temp.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'credit_seat_minutes'),
  'credit_seat_minutes() is gone — a Credit is no longer tied to a length');

-- =============================================================================
-- A CARD PAYMENT IS A CREDIT BOUGHT ON THE DAY IT WAS PAID
-- =============================================================================

select pg_temp.ok(
  pg_temp.pay_by_card('cs_test_r40_in_time', '94000000-0000-0000-0000-0000000000a1',
                      '4ccc0000-0000-0000-0000-000000000001', 0, 180) = 'booked',
  'a card payment books the seat');

select pg_temp.act_as('40000000-0000-0000-0000-000000000001');
select pg_temp.ok(
  (public.cancel_booking(pg_temp.booking_of('94000000-0000-0000-0000-0000000000a1',
     '4ccc0000-0000-0000-0000-000000000001'))).credit_issued_czk = 180,
  'cancelling thirty hours ahead returns the whole 180 as credit');
reset role;

select pg_temp.ok(
  (select count(*) from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000001')) = 1
  and (select expires_at from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000001'))
      = now() + interval '60 days',
  'and it comes back as ONE Credit valid sixty days from the payment — not unexpiring',
  (select string_agg(coalesce(expires_at::text, 'null'), ', ')
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000001')));

-- =============================================================================
-- TWELVE HOURS
-- =============================================================================

select pg_temp.ok(
  pg_temp.pay_by_card('cs_test_r40_late', '94000000-0000-0000-0000-0000000000a2',
                      '4ccc0000-0000-0000-0000-000000000002', 0, 180) = 'booked',
  'a card payment books the late game');

select pg_temp.act_as('40000000-0000-0000-0000-000000000002');
select pg_temp.ok(
  (public.cancel_booking(pg_temp.booking_of('94000000-0000-0000-0000-0000000000a2',
     '4ccc0000-0000-0000-0000-000000000002'))).credit_issued_czk = 0,
  'eleven hours ahead is LATE: the spot is released and nothing comes back');
reset role;

select pg_temp.ok(
  pg_temp.balance('4ccc0000-0000-0000-0000-000000000002') = 0,
  'and the ledger agrees');

select pg_temp.ok(
  (select status from public.bookings
    where id = pg_temp.booking_of('94000000-0000-0000-0000-0000000000a2',
                                  '4ccc0000-0000-0000-0000-000000000002')) = 'cancelled',
  'a late cancellation still takes the player off the roster — "I can''t make it" works');

-- =============================================================================
-- A CREDIT PAYS FOR A GAME OF ANY LENGTH
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
values ('4ccc0000-0000-0000-0000-000000000003', 180, 'topup', now() + interval '60 days');

select pg_temp.act_as('40000000-0000-0000-0000-000000000003');
select public.create_booking('94000000-0000-0000-0000-0000000000a3', 'cash', null, null, 0);
reset role;

select pg_temp.ok(
  (select payment_method = 'credit' and credit_applied_czk = 180 and status = 'confirmed'
     from public.bookings
    where id = pg_temp.booking_of('94000000-0000-0000-0000-0000000000a3',
                                  '4ccc0000-0000-0000-0000-000000000003')),
  'one Credit books a sixty-minute game in full');

-- =============================================================================
-- PASSES: SIXTY DAYS, WHATEVER THE TIER
-- =============================================================================

do $$
declare v_topup public.credit_topups;
begin
  perform pg_temp.act_as('40000000-0000-0000-0000-000000000004');
  v_topup := public.begin_pass_purchase(5);
  perform pg_temp.act_as_service();
  perform public.confirm_topup(v_topup.id, null, v_topup.amount_czk);
end $$;
reset role;

select pg_temp.ok(
  (select expires_at from public.credit_ledger
    where player_id = '4ccc0000-0000-0000-0000-000000000004' and reason = 'topup')
    = now() + interval '60 days',
  'a five-game pass is valid sixty days — it used to be one month',
  (select expires_at::text from public.credit_ledger
    where player_id = '4ccc0000-0000-0000-0000-000000000004' and reason = 'topup'));

-- =============================================================================
-- WE CANCEL THE GAME: EVERY RETURNED CREDIT GETS SEVEN MORE DAYS (11.3)
-- =============================================================================

-- (a) paid by card
select pg_temp.pay_by_card('cs_test_r40_we_cancel', '94000000-0000-0000-0000-0000000000a4',
                           '4ccc0000-0000-0000-0000-000000000005', 0, 180);

-- (b) paid from a pass that runs out in three days
insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
values ('4ccc0000-0000-0000-0000-000000000006', 180, 'topup', now() + interval '3 days');
select pg_temp.act_as('40000000-0000-0000-0000-000000000006');
select public.create_booking('94000000-0000-0000-0000-0000000000a4', 'cash', null, null, 0);
reset role;

-- (c) paid from a pass that has ALREADY run out. Built by hand: no RPC can
-- spend an expired batch, but a booking made before the expiry can outlive it.
insert into public.credit_ledger (id, player_id, delta_czk, reason, expires_at)
values ('4b000000-0000-0000-0000-0000000000c7', '4ccc0000-0000-0000-0000-000000000007',
        180, 'topup', now() - interval '1 day');
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk)
values ('4bb00000-0000-0000-0000-0000000000c7', '94000000-0000-0000-0000-0000000000a4',
        '4ccc0000-0000-0000-0000-000000000007', 'confirmed', 'credit', 180, 180);
insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
values ('4ccc0000-0000-0000-0000-000000000007', -180, 'redemption',
        '4bb00000-0000-0000-0000-0000000000c7', '4b000000-0000-0000-0000-0000000000c7');

select pg_temp.act_as_service();
select public.cancel_game('94000000-0000-0000-0000-0000000000a4');
reset role;

select pg_temp.ok(
  (select expires_at from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000005'))
    = now() + interval '67 days',
  'card money comes back valid sixty days from the payment PLUS seven',
  (select string_agg(coalesce(expires_at::text, 'null'), ', ')
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000005')));

select pg_temp.ok(
  (select expires_at from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000006'))
    = now() + interval '10 days',
  'a pass Credit comes back with its own expiry plus seven — three days became ten',
  (select string_agg(coalesce(expires_at::text, 'null'), ', ')
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000006')));

select pg_temp.ok(
  (select batch_id is null from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000006')),
  'as a Credit of its own — the rest of the pass keeps the date it had');

select pg_temp.ok(
  (select expires_at from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000007'))
    = now() + interval '7 days',
  'and never less than seven days from today, even for a pass that already ran out',
  (select string_agg(coalesce(expires_at::text, 'null'), ', ')
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000007')));

select pg_temp.ok(
  (select count(*) from public.credit_ledger
    where reason = 'cancellation_credit' and expires_at is null
      and player_id in ('4ccc0000-0000-0000-0000-000000000005',
                        '4ccc0000-0000-0000-0000-000000000006',
                        '4ccc0000-0000-0000-0000-000000000007')) = 0,
  'none of it lands in the unexpiring pool');

-- =============================================================================
-- PAID, BUT THE GAME COULD NOT TAKE THEM: A CREDIT, BOUGHT TODAY
-- =============================================================================

select pg_temp.ok(
  pg_temp.pay_by_card('cs_test_r40_no_seat', '94000000-0000-0000-0000-0000000000a5',
                      '4ccc0000-0000-0000-0000-000000000008', 0, 180) = 'credited',
  'a payment for a game that cannot take it becomes credit');

select pg_temp.ok(
  (select expires_at from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000008'))
    = now() + interval '60 days',
  'valid sixty days from today');

-- =============================================================================
-- GUESTS OFF A CARD-PAID PARTY: THE CARD SHARE IS A CREDIT TOO
-- =============================================================================

select pg_temp.pay_by_card('cs_test_r40_guests_card', '94000000-0000-0000-0000-0000000000a6',
                           '4ccc0000-0000-0000-0000-000000000009', 2, 540);

select pg_temp.act_as('40000000-0000-0000-0000-000000000009');
select pg_temp.ok(
  (public.cancel_guests(pg_temp.booking_of('94000000-0000-0000-0000-0000000000a6',
     '4ccc0000-0000-0000-0000-000000000009'), 1)).credit_issued_czk = 180,
  'removing one guest of a 540 CZK card party returns 180');
reset role;

select pg_temp.ok(
  (select count(*) = 1 and min(expires_at) = now() + interval '60 days'
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000009')),
  'as a Credit valid sixty days from the payment',
  (select string_agg(coalesce(expires_at::text, 'null'), ', ')
     from pg_temp.refunds('4ccc0000-0000-0000-0000-000000000009')));

-- =============================================================================
-- A REFUND NEVER EXCEEDS WHAT THE BOOKING IS STILL WORTH
--
-- The bug this round found: guests removed in time were refunded, and a later
-- cancellation of the booking mirrored EVERY redemption it had ever written —
-- including the guests' — back to the pass. A party of three on three Credits
-- came back as five.
-- =============================================================================

insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
values ('4ccc0000-0000-0000-0000-000000000010', 540, 'topup', now() + interval '60 days');

select pg_temp.act_as('40000000-0000-0000-0000-000000000010');
select public.create_booking('94000000-0000-0000-0000-0000000000a7', 'cash', null, null, 2);
select public.cancel_guests(pg_temp.booking_of('94000000-0000-0000-0000-0000000000a7',
  '4ccc0000-0000-0000-0000-000000000010'), 2);
select public.cancel_booking(pg_temp.booking_of('94000000-0000-0000-0000-0000000000a7',
  '4ccc0000-0000-0000-0000-000000000010'));
reset role;

select pg_temp.ok(
  pg_temp.balance('4ccc0000-0000-0000-0000-000000000010') = 540,
  'three Credits spent, all three returned — three, not five',
  pg_temp.balance('4ccc0000-0000-0000-0000-000000000010')::text);

-- =============================================================================
-- CONSENT RECORDS (Texty 2.4): who, when, which wording, which version
-- =============================================================================

select pg_temp.act_as('40000000-0000-0000-0000-000000000011');
select pg_temp.ok_probe(
  $q$select public.record_consent('terms', 'Seznámil(a) jsem se…', 'cs', '2.0', '{}'::jsonb)$q$,
  'rows:1', 'a player records their own consent');
select pg_temp.ok_probe(
  $q$select public.record_consent('withdrawal_waiver', 'x', 'cs', '2.0', '{}'::jsonb)$q$,
  'raise:CONSENT_KIND_INVALID',
  'but not a purchase waiver — only the payment webhook records that');
select pg_temp.ok_probe(
  $q$select public.record_consent('terms', '', 'cs', '2.0', '{}'::jsonb)$q$,
  'raise:CONSENT_WORDING_REQUIRED', 'and never without the words that were shown');
select pg_temp.ok_probe(
  $q$select public.record_consent_for('4ccc0000-0000-0000-0000-000000000012'::uuid,
       'terms', 'x', 'cs', '2.0', '{}'::jsonb, now())$q$,
  'denied', 'nor anyone else''s');
select pg_temp.ok_probe(
  $q$insert into public.consent_records (player_id, kind, wording, locale, terms_version)
     values ('4ccc0000-0000-0000-0000-000000000011', 'terms', 'x', 'cs', '2.0') returning id$q$,
  'denied', 'and there is no direct write to the table');
reset role;

select pg_temp.act_as_service();
select pg_temp.ok_probe(
  $q$select public.record_consent_for('4ccc0000-0000-0000-0000-000000000012'::uuid,
       'withdrawal_waiver', 'Žádám o okamžité dodání Kreditů…', 'cs', '2.0',
       '{"stripe_session_id":"cs_test_x"}'::jsonb, now())$q$,
  'rows:1', 'the webhook records the waiver ticked inside Stripe');
reset role;

select pg_temp.act_as('40000000-0000-0000-0000-000000000011');
select pg_temp.ok(
  (select count(*) from public.consent_records) = 1,
  'a player reads their own records and nobody else''s',
  (select count(*) from public.consent_records)::text);
reset role;

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.record_consent('terms', 'x', 'cs', '2.0', '{}'::jsonb)$q$,
  'denied', 'an anonymous visitor records nothing');
reset role;

select pg_temp.ok(
  (select count(*) from public.consent_records
    where player_id = '4ccc0000-0000-0000-0000-000000000011'
      and kind = 'terms' and locale = 'cs' and terms_version = '2.0'
      and accepted_at = now()) = 1,
  'the record carries the kind, the language, the version and the time');

-- =============================================================================
-- THE CAPABILITY FLAGS — restated as a superset of what was live
-- =============================================================================

select pg_temp.ok(
  (public.app_capabilities() ->> 'creditsSixtyDays')::boolean
  and (public.app_capabilities() ->> 'consentRecords')::boolean,
  'app_capabilities reports both round-40 flags');

select pg_temp.ok(
  (select count(*) from jsonb_object_keys(public.app_capabilities())) >= 30,
  'and still reports the twenty-eight it reported before (later files only add)',
  (select count(*) from jsonb_object_keys(public.app_capabilities()))::text);

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
