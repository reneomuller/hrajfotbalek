-- =============================================================================
-- Phase 17 assertions — site_settings and set_site_setting
--
-- Run:  node supabase/tests/run.mjs site_settings
--
-- Transaction-wrapped and rolled back.
--
-- THE ANONYMOUS READ IS THE HEADLINE ASSERTION (REQ-HOME-003). Supabase grants
-- nothing by default here, and a missing grant returns EMPTY rather than
-- erroring — so on this surface the failure looks like "the stats strip has no
-- content yet" rather than "the stats strip cannot be read". Asserting the
-- grant by reading as `anon` is the only way to tell those apart.
--
-- `call()` is the value-consuming probe (POLISH.md).
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
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
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

/** Reads the row as the owner, for the state assertions. */
create function pg_temp.setting(p_key text)
returns text language sql security definer as $$
  select settings ->> p_key from public.site_settings where id = 'singleton';
$$;

-- SECURITY DEFINER because `events` has NO client grants at all — not even to
-- an admin session. That is deliberate (migration 1) and asserted elsewhere;
-- here it just means the audit trail has to be read as the owner.
-- SCOPED TO THIS SUITE'S OWN ADMIN, not to the whole table.
--
-- The transaction rolls back, so nothing this suite writes survives — but the
-- count is over rows that already EXIST, and the E2E suite writes
-- `site_setting_changed` rows of its own. Counting table-wide made this
-- assertion pass only while nobody else had ever changed a setting, which is a
-- suite that goes red for a reason unrelated to what it tests.
--
-- The fixture admin exists only inside this transaction, so filtering on it
-- counts exactly this suite's writes.
create function pg_temp.event_count(p_key text)
returns bigint language sql security definer as $$
  select count(*) from public.events
   where event_type = 'site_setting_changed'
     and metadata ->> 'key' = p_key
     and player_id = 'aaaa0000-0000-0000-0000-00000000f171';
$$;

/** The most recent settings event written by THIS suite, as "value|admin". */
create function pg_temp.last_setting_event()
returns text language sql security definer as $$
  select (metadata ->> 'value') || '|' || coalesce(player_id::text, '')
    from public.events
   where event_type = 'site_setting_changed'
     and player_id = 'aaaa0000-0000-0000-0000-00000000f171'
   order by created_at desc, id desc
   limit 1;
$$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000f171', 'admin-17@test.invalid'),
  ('b0000000-0000-0000-0000-00000000f172', 'player-17@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000f171', 'Admin17',  'admin-17@test.invalid',  'a0000000-0000-0000-0000-00000000f171', true),
  ('bbbb0000-0000-0000-0000-00000000f172', 'Player17', 'player-17@test.invalid', 'b0000000-0000-0000-0000-00000000f172', false);

-- =============================================================================
-- REQ-HOME-003 — the anonymous read, which is the whole reason for the grant
-- =============================================================================

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

select pg_temp.ok_call(
  $q$select count(*) from public.site_settings$q$,
  '1',
  'anon reads the single settings row — the grant is real, not assumed');

select pg_temp.ok_call(
  $q$select id from public.site_settings$q$,
  'singleton',
  'and it is the singleton row');

-- Reading is all anon may do. A grant without a matching absence of write
-- grants would be a public page that edits itself.
--
-- Run through its own probe rather than `call()`: an UPDATE is a statement,
-- not an expression, and a data-modifying CTE is only legal at the top level —
-- wrapping one in `select (…)` fails with 0A000 for a reason that has nothing
-- to do with privileges, which is exactly the kind of false green this suite
-- exists to avoid.
do $$
begin
  begin
    execute $u$update public.site_settings
                  set settings = '{"active_players": 9999}'::jsonb
                where id = 'singleton'$u$;
    perform pg_temp.ok(false, 'anon cannot write the settings row', 'the update succeeded');
  exception
    when insufficient_privilege then
      perform pg_temp.ok(true, 'anon cannot write the settings row');
    when others then
      perform pg_temp.ok(false, 'anon cannot write the settings row', sqlstate);
  end;
end $$;

reset role;

-- =============================================================================
-- set_site_setting — admin only
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-00000000f172');
select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', '250'::jsonb)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin player cannot change a site setting');
reset role;

select set_config('role', 'anon', true);
select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', '250'::jsonb)$q$,
  'denied',
  'anon is denied EXECUTE on set_site_setting — the revoke, not the body');
reset role;

-- =============================================================================
-- The write, the audit trail, and the closed key set
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000f171');

do $$
begin
  perform public.set_site_setting('active_players', '250'::jsonb);

  perform pg_temp.ok(
    pg_temp.setting('active_players') = '250',
    'an admin sets the active-player number');

  -- REQ-HOME-004: a public claim about the size of the community with no audit
  -- trail is a number nobody can account for.
  perform pg_temp.ok(
    pg_temp.event_count('active_players') = 1,
    'the change emits site_setting_changed');

  perform pg_temp.ok(
    pg_temp.last_setting_event() = '250|aaaa0000-0000-0000-0000-00000000f171',
    'the event records the new value and which admin made the change',
    coalesce(pg_temp.last_setting_event(), 'null'));
end $$;

select pg_temp.ok_call(
  $q$select public.set_site_setting('actve_playrs', '250'::jsonb)$q$,
  'raise:SETTING_KEY_UNKNOWN',
  'a misspelled key is refused rather than stored — an unread key renders as an empty strip');

select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', '"lots"'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a non-numeric active-player count is refused');

select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', '-5'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a negative active-player count is refused');

select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', '250.5'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a fractional active-player count is refused — people are whole numbers');

-- --- games per week (migration 37) --------------------------------------------
--
-- THE SAME VALIDATION, ASSERTED SEPARATELY. The two numeric keys share one
-- branch inside the function precisely so they cannot diverge — which is worth
-- nothing unless something checks that the second key actually reaches it. A
-- key added to the `in` list and forgotten in the validation is a setting that
-- silently accepts "lots".

do $$
begin
  perform public.set_site_setting('games_per_week', '7'::jsonb);

  perform pg_temp.ok(
    pg_temp.setting('games_per_week') = '7',
    'games-per-week stores as a number');

  perform pg_temp.ok(
    pg_temp.event_count('games_per_week') = 1,
    'a games-per-week change is audited like any other setting');
end $$;

select pg_temp.ok_call(
  $q$select public.set_site_setting('games_per_week', '"lots"'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a non-numeric games-per-week is refused');

select pg_temp.ok_call(
  $q$select public.set_site_setting('games_per_week', '-1'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a negative games-per-week is refused');

select pg_temp.ok_call(
  $q$select public.set_site_setting('games_per_week', '7.5'::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a fractional games-per-week is refused — the copy renders it with a plus, not a point');

-- --- player of the month ------------------------------------------------------

do $$
begin
  perform public.set_site_setting(
    'player_of_month', to_jsonb('bbbb0000-0000-0000-0000-00000000f172'::text));

  perform pg_temp.ok(
    pg_temp.setting('player_of_month') = 'bbbb0000-0000-0000-0000-00000000f172',
    'an admin picks the player of the month');

  -- Setting one key must not clear the other: the update is a jsonb merge, not
  -- a replacement, and getting that wrong would blank the stats strip every
  -- time the photo was changed.
  perform pg_temp.ok(
    pg_temp.setting('active_players') = '250',
    'setting one key leaves the other alone');

  perform public.set_site_setting('player_of_month', 'null'::jsonb);
  perform pg_temp.ok(
    pg_temp.setting('player_of_month') is null,
    'the pick can be cleared, which is a real thing an admin does between months');
end $$;

select pg_temp.ok_call(
  $q$select public.set_site_setting('player_of_month', to_jsonb('99990000-0000-0000-0000-00000000dead'::text))$q$,
  'raise:PLAYER_NOT_FOUND',
  'a player of the month who does not exist is refused, not stored');

-- =============================================================================
-- SQL NULL, WHICH IS WHAT POSTGREST ACTUALLY SENDS
--
-- The E2E spec found this and this suite had missed it. PostgREST marshals a
-- JavaScript `null` argument as SQL NULL, never as the jsonb value `'null'` —
-- and every comparison against SQL NULL evaluates to NULL, which plpgsql
-- treats as false. So the version that passed the tests above refused a NULL
-- `player_of_month` with PLAYER_NOT_FOUND (the admin form's "clear the pick"
-- button, failing with a message about a player nobody named) and ACCEPTED a
-- NULL `active_players`, storing it and silently emptying the stats strip.
--
-- Asserted with a literal SQL NULL rather than `'null'::jsonb`, because that
-- is the distinction the whole defect turned on.
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-00000000f171');

do $$
begin
  perform public.set_site_setting(
    'player_of_month', to_jsonb('bbbb0000-0000-0000-0000-00000000f172'::text));
  perform public.set_site_setting('player_of_month', null::jsonb);

  perform pg_temp.ok(
    pg_temp.setting('player_of_month') is null,
    'a SQL NULL clears the pick — what the admin form actually sends');
end $$;

select pg_temp.ok_call(
  $q$select public.set_site_setting('active_players', null::jsonb)$q$,
  'raise:SETTING_VALUE_INVALID',
  'a SQL NULL active-player count is refused rather than silently emptying the strip');

reset role;

reset role;

-- =============================================================================
-- The singleton, enforced rather than conventional
-- =============================================================================

do $$
begin
  begin
    insert into public.site_settings (id, settings) values ('second', '{}'::jsonb);
    perform pg_temp.ok(false, 'a second settings row is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'a second settings row is rejected by CHECK');
  end;

  begin
    update public.site_settings set settings = '"not an object"'::jsonb where id = 'singleton';
    perform pg_temp.ok(false, 'a non-object settings value is rejected by CHECK');
  exception when check_violation then
    perform pg_temp.ok(true, 'a non-object settings value is rejected by CHECK');
  end;
end $$;

-- =============================================================================
-- The catalog widening, asserted because forgetting it fails at the WRITE
-- =============================================================================

select pg_temp.ok(
  (select count(*) = 1 from pg_constraint
    where conname = 'events_event_type_catalog'
      and pg_get_constraintdef(oid) like '%site_setting_changed%'),
  'the event catalog admits site_setting_changed — widened in the same migration that emits it');

-- And the superset property the standing sign-off depends on: nothing that was
-- permitted before is missing now.
select pg_temp.ok(
  (select bool_and(pg_get_constraintdef(oid) like '%' || t || '%')
     from pg_constraint,
          unnest(array['topup_requested','topup_confirmed','profile_photo_removed',
                       'player_anonymized','admin_granted','attendance_marked']) as t
    where conname = 'events_event_type_catalog'),
  'the widened catalog is a strict superset — no previously permitted type was dropped');

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
