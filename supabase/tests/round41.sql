-- =============================================================================
-- ROUND 41 — short game links and deleting one notification, drilled.
--
--   * every game has a number, assigned in order, unique, readable by anyone
--     who can read the game — it is what `/game/<number>` looks up
--   * a player can delete ONE notification from their bell; nobody can delete
--     somebody else's, and a visitor cannot call it at all
--
-- Run:  node supabase/tests/run.mjs round41
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

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email)
select ('41410000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'r41-' || n || '@test.invalid'
  from generate_series(1, 2) n;

insert into public.players (id, nickname, email, auth_user_id, country)
values
  ('4e410000-0000-0000-0000-000000000001', 'R41One', 'r41-1@test.invalid', '41410000-0000-0000-0000-000000000001', 'CZ'),
  ('4e410000-0000-0000-0000-000000000002', 'R41Two', 'r41-2@test.invalid', '41410000-0000-0000-0000-000000000002', 'CZ');

insert into public.games (id, venue, starts_at, capacity, price_czk, status, duration_minutes) values
  ('94141000-0000-0000-0000-0000000000a1', 'R41 First',  now() + interval '3 days', 12, 180, 'published', 90),
  ('94141000-0000-0000-0000-0000000000a2', 'R41 Second', now() + interval '4 days', 12, 180, 'published', 90);

insert into public.notifications (id, title, body, audience) values
  ('94141000-0000-0000-0000-0000000000b1', 'For everyone', 'A broadcast', 'all');
insert into public.notifications (id, title, body, recipient_id, kind) values
  ('94141000-0000-0000-0000-0000000000b2', 'For Two', 'Personal', '4e410000-0000-0000-0000-000000000002', null);

-- =============================================================================
-- GAME NUMBERS
-- =============================================================================

select pg_temp.ok(
  (select game_number from public.games where id = '94141000-0000-0000-0000-0000000000a2')
    > (select game_number from public.games where id = '94141000-0000-0000-0000-0000000000a1'),
  'a new game gets the next number, without anybody passing one',
  (select string_agg(game_number::text, ',' order by created_at) from public.games
    where id in ('94141000-0000-0000-0000-0000000000a1', '94141000-0000-0000-0000-0000000000a2')));

select pg_temp.ok(
  not exists (select 1 from public.games where game_number is null),
  'every game has a number, the old ones included');

select pg_temp.ok(
  (select count(*) = count(distinct game_number) from public.games),
  'no two games share a number');

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select id from public.games where game_number = (select game_number from public.games where id = '94141000-0000-0000-0000-0000000000a1')$q$,
  'rows:1', 'a signed-out visitor can find a published game by its number — the shared link');
reset role;

-- =============================================================================
-- DELETING ONE NOTIFICATION
-- =============================================================================

select pg_temp.act_as_anon();
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('94141000-0000-0000-0000-0000000000b1'::uuid)$q$,
  'denied', 'an anonymous visitor cannot call it at all');
reset role;

select pg_temp.act_as('41410000-0000-0000-0000-000000000001');
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('94141000-0000-0000-0000-0000000000b2'::uuid)$q$,
  'raise:NOTIFICATION_NOT_FOUND', 'a player cannot touch somebody else''s notification');
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('00000000-0000-0000-0000-000000000000'::uuid)$q$,
  'raise:NOTIFICATION_NOT_FOUND', 'nor one that does not exist');
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('94141000-0000-0000-0000-0000000000b1'::uuid)$q$,
  'rows:1', 'a player deletes a broadcast from their own bell');
select pg_temp.ok(
  not exists (select 1 from public.my_notifications(100) where id = '94141000-0000-0000-0000-0000000000b1'),
  'and it is gone from their bell');
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('94141000-0000-0000-0000-0000000000b1'::uuid)$q$,
  'rows:1', 'deleting it twice is harmless');
reset role;

select pg_temp.act_as('41410000-0000-0000-0000-000000000002');
select pg_temp.ok(
  exists (select 1 from public.my_notifications(100) where id = '94141000-0000-0000-0000-0000000000b1'),
  'the same broadcast is still in everybody else''s bell');
select pg_temp.ok_probe(
  $q$select public.dismiss_notification('94141000-0000-0000-0000-0000000000b2'::uuid)$q$,
  'rows:1', 'the recipient can delete their own personal notification');
select pg_temp.ok(
  not exists (select 1 from public.my_notifications(100) where id = '94141000-0000-0000-0000-0000000000b2'),
  'and it is gone');
reset role;

select pg_temp.ok(
  exists (select 1 from public.notifications where id = '94141000-0000-0000-0000-0000000000b1'),
  'deleting from a bell never deletes the notification itself');

-- =============================================================================
-- CAPABILITIES
-- =============================================================================

select pg_temp.ok(
  (public.app_capabilities() ->> 'gameNumbers')::boolean
  and (public.app_capabilities() ->> 'dismissOneNotification')::boolean,
  'app_capabilities reports both');

select pg_temp.ok(
  not exists (select 1 from jsonb_each(public.app_capabilities()) where value <> 'true'::jsonb),
  'and every flag it reports is true', public.app_capabilities()::text);

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       case when count(*) filter (where not passed) = 0
            then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
