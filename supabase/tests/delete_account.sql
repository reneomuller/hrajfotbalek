-- =============================================================================
-- ROUND 40 — deleting an account, drilled.
--
-- The person goes, the books stay: future bookings cancelled and seats freed,
-- unused Credits lapse, the row anonymised, the login cut (Obchodní podmínky
-- 4.7 and 14.5, Zásady 3.1).
--
-- Run:  node supabase/tests/run.mjs delete_account
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

insert into auth.users (id, email)
select ('41000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'del-' || n || '@test.invalid'
  from generate_series(1, 4) n;

-- 1 the player who deletes themselves · 2 deleted by the admin · 3 the admin
-- · 4 a bystander who must not be able to delete anyone
insert into public.players (id, nickname, email, phone, auth_user_id, is_admin, country, photo_path, marketing_opt_in)
values
  ('4ddd0000-0000-0000-0000-000000000001', 'DelSelf',  'del-1@test.invalid', '+420600000001', '41000000-0000-0000-0000-000000000001', false, 'CZ', 'players/4ddd0000-0000-0000-0000-000000000001.jpg', true),
  ('4ddd0000-0000-0000-0000-000000000002', 'DelByAdm', 'del-2@test.invalid', '+420600000002', '41000000-0000-0000-0000-000000000002', false, 'CZ', null, false),
  ('4ddd0000-0000-0000-0000-000000000003', 'DelAdmin', 'del-3@test.invalid', null,            '41000000-0000-0000-0000-000000000003', true,  'CZ', null, false),
  ('4ddd0000-0000-0000-0000-000000000004', 'DelOther', 'del-4@test.invalid', null,            '41000000-0000-0000-0000-000000000004', false, 'CZ', null, false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94100000-0000-0000-0000-0000000000a1', 'Del Future', now() + interval '3 days', 12, 180, 'published', 90),
  ('94100000-0000-0000-0000-0000000000a2', 'Del Past',   now() - interval '3 days', 12, 180, 'played',    90);

-- Credits: a batch of two (one gets spent) and 90 CZK of old unexpiring pool.
insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
values ('4ddd0000-0000-0000-0000-000000000001', 360, 'topup', now() + interval '60 days');
insert into public.credit_ledger (player_id, delta_czk, reason)
values ('4ddd0000-0000-0000-0000-000000000001', 90, 'cancellation_credit');

select pg_temp.act_as('41000000-0000-0000-0000-000000000001');
select public.create_booking('94100000-0000-0000-0000-0000000000a1', 'cash', null, null, 0);
reset role;

-- A past booking, which is history and must survive.
insert into public.bookings (game_id, player_id, status, payment_method, price_czk, credit_applied_czk)
values ('94100000-0000-0000-0000-0000000000a2', '4ddd0000-0000-0000-0000-000000000001', 'confirmed', 'qr', 180, 0);

-- =============================================================================
-- WHO MAY
-- =============================================================================

select pg_temp.act_as('41000000-0000-0000-0000-000000000004');
select pg_temp.ok_probe(
  $q$select public.delete_player_account('4ddd0000-0000-0000-0000-000000000002'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION', 'a player cannot delete somebody else');
reset role;

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.delete_player_account('4ddd0000-0000-0000-0000-000000000002'::uuid)$q$,
  'denied', 'an anonymous visitor cannot call it at all');
reset role;

select pg_temp.act_as('41000000-0000-0000-0000-000000000003');
select pg_temp.ok_probe(
  $q$select public.delete_player_account('4ddd0000-0000-0000-0000-000000000003'::uuid)$q$,
  'raise:CANNOT_DELETE_ADMIN', 'an admin account cannot be deleted, not even by itself');
reset role;

-- =============================================================================
-- A PLAYER DELETES THEMSELVES
-- =============================================================================

select pg_temp.act_as('41000000-0000-0000-0000-000000000001');
create temp table _r on commit drop as
  select public.delete_player_account('4ddd0000-0000-0000-0000-000000000001') as r;
reset role;

select pg_temp.ok(
  (select r ->> 'auth_user_id' from _r) = '41000000-0000-0000-0000-000000000001'
  and (select r ->> 'photo_path' from _r) = 'players/4ddd0000-0000-0000-0000-000000000001.jpg',
  'it hands back the login and the photo for the server to remove',
  (select r::text from _r));

select pg_temp.ok(
  (select nickname = 'Deleted ' || player_number::text and email is null and phone is null
          and photo_path is null and country is null and auth_user_id is null
          and not marketing_opt_in and deleted_at = now() and banned_at is not null
     from public.players where id = '4ddd0000-0000-0000-0000-000000000001'),
  'the row is anonymised, not deleted, and can no longer act');

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '94100000-0000-0000-0000-0000000000a1'
      and player_id = '4ddd0000-0000-0000-0000-000000000001') = 'cancelled',
  'the future booking is cancelled');

select pg_temp.ok(
  public.game_seats_taken('94100000-0000-0000-0000-0000000000a1') = 0,
  'and its seat is free');

select pg_temp.ok(
  (select status from public.bookings
    where game_id = '94100000-0000-0000-0000-0000000000a2'
      and player_id = '4ddd0000-0000-0000-0000-000000000001') = 'confirmed',
  'the past booking stays — it is history, and the books');

select pg_temp.ok(
  pg_temp.balance('4ddd0000-0000-0000-0000-000000000001') = 0
  and (select count(*) from public.credit_ledger
        where player_id = '4ddd0000-0000-0000-0000-000000000001'
          and reason = 'pass_expiry' and note = 'account deleted') = 2,
  'every unused Credit lapses — the batch remainder and the old pool, each named',
  pg_temp.balance('4ddd0000-0000-0000-0000-000000000001')::text);

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'account_deleted'
      and player_id = '4ddd0000-0000-0000-0000-000000000001'
      and metadata ->> 'by' = 'self') = 1,
  'and it is logged as the player''s own act');

select pg_temp.act_as('41000000-0000-0000-0000-000000000003');
select pg_temp.ok(
  public.delete_player_account('4ddd0000-0000-0000-0000-000000000001') is null,
  'deleting twice is a no-op, not an error');
reset role;

-- =============================================================================
-- AN ADMIN DELETES A PLAYER
-- =============================================================================

select pg_temp.act_as('41000000-0000-0000-0000-000000000003');
select public.delete_player_account('4ddd0000-0000-0000-0000-000000000002');
reset role;

select pg_temp.ok(
  (select deleted_at is not null and phone is null from public.players
    where id = '4ddd0000-0000-0000-0000-000000000002')
  and (select metadata ->> 'by' from public.events
        where event_type = 'account_deleted'
          and player_id = '4ddd0000-0000-0000-0000-000000000002') = 'admin',
  'an admin can delete a player, and the log says an admin did');

select pg_temp.ok(
  not exists (select 1 from public.banned_phones where player_id = '4ddd0000-0000-0000-0000-000000000002'),
  'deleting is not banning: the phone number stays free to sign up again');

select pg_temp.ok(
  (public.app_capabilities() ->> 'deleteAccount')::boolean,
  'app_capabilities reports deleteAccount');

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
