-- =============================================================================
-- ROUND 42 — removing a player, with or without their Credit back.
--
-- The owner: "when manually removing a player from a game, it automatically
-- grants them a credit. I need there to be an option for the credit to return
-- or for it not to return ... (this can happen when someone cancels a game
-- last minute and texts us instead of doing it through the app)". The admin
-- dialog's switch starts OFF; the function's own default stays "return", so a
-- caller that says nothing keeps the old behaviour.
--
-- And when the Credit does come back, it comes back by the round-40 rules a
-- player's own cancellation follows (the owner's choice): redemptions return
-- to their batch with its expiry, a paid booking becomes a Credit valid
-- credit_validity_days() from the payment — never unexpiring money.
--
-- Run:  node supabase/tests/run.mjs admin_remove_credit_choice
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

create function pg_temp.credited(p_booking uuid)
returns integer language sql as $$
  select coalesce(sum(delta_czk), 0)::integer from public.credit_ledger
   where booking_id = p_booking and reason = 'cancellation_credit'
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email)
select ('42430000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r42r-' || n || '@test.invalid'
  from generate_series(1, 5) n;

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('4e430000-0000-0000-0000-000000000001', 'R42RAdmin', 'r42r-1@test.invalid', '42430000-0000-0000-0000-000000000001', true),
  ('4e430000-0000-0000-0000-000000000002', 'R42RCard',  'r42r-2@test.invalid', '42430000-0000-0000-0000-000000000002', false),
  ('4e430000-0000-0000-0000-000000000003', 'R42RBatch', 'r42r-3@test.invalid', '42430000-0000-0000-0000-000000000003', false),
  ('4e430000-0000-0000-0000-000000000004', 'R42RLate',  'r42r-4@test.invalid', '42430000-0000-0000-0000-000000000004', false),
  ('4e430000-0000-0000-0000-000000000005', 'R42ROld',   'r42r-5@test.invalid', '42430000-0000-0000-0000-000000000005', false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94243000-0000-0000-0000-0000000000a1', 'R42R Pitch', now() + interval '2 hours', 12, 180, 'published', 90);

-- A booking paid by card (the old QR rail stands in: confirmed, no credit).
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk) values
  ('4bb43000-0000-0000-0000-0000000000b2', '94243000-0000-0000-0000-0000000000a1',
   '4e430000-0000-0000-0000-000000000002', 'confirmed', 'qr', 180, 0);

-- A booking paid with a Credit from a batch that expires in ten days.
insert into public.credit_ledger (id, player_id, delta_czk, reason, expires_at) values
  ('4b430000-0000-0000-0000-0000000000c3', '4e430000-0000-0000-0000-000000000003',
   180, 'topup', now() + interval '10 days');
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk) values
  ('4bb43000-0000-0000-0000-0000000000b3', '94243000-0000-0000-0000-0000000000a1',
   '4e430000-0000-0000-0000-000000000003', 'confirmed', 'credit', 180, 180);
insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id) values
  ('4e430000-0000-0000-0000-000000000003', -180, 'redemption',
   '4bb43000-0000-0000-0000-0000000000b3', '4b430000-0000-0000-0000-0000000000c3');

-- The late text: a paid booking the admin removes WITHOUT returning anything.
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk) values
  ('4bb43000-0000-0000-0000-0000000000b4', '94243000-0000-0000-0000-0000000000a1',
   '4e430000-0000-0000-0000-000000000004', 'confirmed', 'qr', 180, 0);

-- A caller that says nothing about the Credit — the build before this round.
insert into public.bookings (id, game_id, player_id, status, payment_method, price_czk, credit_applied_czk) values
  ('4bb43000-0000-0000-0000-0000000000b5', '94243000-0000-0000-0000-0000000000a1',
   '4e430000-0000-0000-0000-000000000005', 'confirmed', 'qr', 180, 0);

-- =============================================================================
-- WHO MAY
-- =============================================================================

select pg_temp.act_as('42430000-0000-0000-0000-000000000002');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking('4bb43000-0000-0000-0000-0000000000b4'::uuid, false)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot remove anybody, with or without a refund');
reset role;

-- =============================================================================
-- NO CREDIT BACK — the switch left off
-- =============================================================================

select pg_temp.act_as('42430000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking('4bb43000-0000-0000-0000-0000000000b4'::uuid, false)$q$,
  'rows:1', 'an admin removes a player and returns nothing');
reset role;

select pg_temp.ok(
  (select status from public.bookings where id = '4bb43000-0000-0000-0000-0000000000b4') = 'cancelled',
  'the booking is cancelled and the seat is free');
select pg_temp.ok(
  pg_temp.credited('4bb43000-0000-0000-0000-0000000000b4') = 0,
  'no Credit is written for it', pg_temp.credited('4bb43000-0000-0000-0000-0000000000b4')::text);
select pg_temp.ok(
  (select (metadata ->> 'credit_returned')::boolean = false
          and (metadata ->> 'withheld_czk')::integer = 180
          and (metadata ->> 'credit_issued_czk')::integer = 0
     from public.events
    where event_type = 'admin_booking_removed'
      and booking_id = '4bb43000-0000-0000-0000-0000000000b4'),
  'the log says the Credit was withheld, and how much — the answer to a later complaint');

-- =============================================================================
-- CREDIT BACK — the switch on, by round-40 rules
-- =============================================================================

select pg_temp.act_as('42430000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking('4bb43000-0000-0000-0000-0000000000b2'::uuid, true)$q$,
  'rows:1', 'an admin removes a card-paid player and returns the Credit');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking('4bb43000-0000-0000-0000-0000000000b3'::uuid, true)$q$,
  'rows:1', 'and a player who paid with a Credit');
reset role;

select pg_temp.ok(
  (select count(*) = 1 and sum(delta_czk) = 180
          and bool_and(expires_at is not null
                       and expires_at::date = (public.booking_paid_at('4bb43000-0000-0000-0000-0000000000b2')
                                               + make_interval(days => public.credit_validity_days()))::date)
     from public.credit_ledger
    where booking_id = '4bb43000-0000-0000-0000-0000000000b2' and reason = 'cancellation_credit'),
  'a card payment comes back as a Credit valid 60 days from the payment, not as unexpiring money');
select pg_temp.ok(
  (select count(*) = 1 and sum(delta_czk) = 180
          and bool_and(batch_id = '4b430000-0000-0000-0000-0000000000c3')
     from public.credit_ledger
    where booking_id = '4bb43000-0000-0000-0000-0000000000b3' and reason = 'cancellation_credit'),
  'a spent Credit goes back to the batch it came from, keeping that batch''s expiry');
select pg_temp.ok(
  (select (metadata ->> 'credit_returned')::boolean and (metadata ->> 'credit_issued_czk')::integer = 180
     from public.events
    where event_type = 'admin_booking_removed'
      and booking_id = '4bb43000-0000-0000-0000-0000000000b2'),
  'and the log says it was returned');

-- =============================================================================
-- A CALLER THAT SAYS NOTHING keeps the old behaviour: the Credit comes back
-- =============================================================================

select pg_temp.act_as('42430000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.admin_remove_booking('4bb43000-0000-0000-0000-0000000000b5'::uuid)$q$,
  'rows:1', 'the one-argument call still works');
reset role;
select pg_temp.ok(
  pg_temp.credited('4bb43000-0000-0000-0000-0000000000b5') = 180,
  'and returns the Credit, as every removal did before this round');

select pg_temp.ok(
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_remove_booking'),
  'there is ONE admin_remove_booking — no stale overload for a caller to bind to');

select pg_temp.ok(
  (public.app_capabilities() ->> 'adminRemoveCreditChoice')::boolean,
  'app_capabilities reports adminRemoveCreditChoice');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
