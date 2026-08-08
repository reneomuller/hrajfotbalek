-- =============================================================================
-- v1.3 conformance — the Phase 1 security invariants, still holding
--
-- Run:  node supabase/tests/run.mjs v13_conformance/security
--
-- Transaction-wrapped and rolled back.
--
-- WHY THIS SUITE EXISTS DURING A FRONT-END ROUND. v1.3 rewrites 83 of 144
-- files in `app/` and `components/`. None of that should touch the security
-- surface, and that is exactly the condition under which a regression goes
-- unnoticed: nobody is looking at RLS while restyling a card. This suite is the
-- thing that looks.
--
-- The rule it defends, from CLAUDE.md: every state transition is a
-- SECURITY DEFINER plpgsql RPC with `search_path = ''`, there are zero direct
-- client writes to any state-bearing table, and authorization lives INSIDE the
-- function rather than in the route that calls it — because a route guard is
-- skipped by anyone using curl.
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

/*
 * `call()` CONSUMES the value it selects. This is not a style choice.
 *
 * `select count(*) from (select some_function()) _p` can report success for a
 * call that never ran: count(*) reads no column, so the planner is free to
 * prune a non-volatile function call straight out of the plan, and the
 * privilege check goes with it. `count(_p::text)` forces evaluation.
 *
 * §7 of this suite DEMONSTRATES the difference rather than asserting it from
 * memory, because a helper whose correctness nobody can see is a helper that
 * gets "simplified" back into the bug.
 */
create function pg_temp.call(sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'select (' || sql || ')::text' into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then return 'denied';
  when others then return 'error:' || sqlstate;
end $$;

create function pg_temp.attempt(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when insufficient_privilege then return 'denied';
  when check_violation then return 'check_violation';
  when others then return 'error:' || sqlstate;
end $$;

-- =============================================================================
-- 1. Deny by default, everywhere
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
  'every table in public has RLS enabled',
  (select coalesce(string_agg(c.relname, ', '), 'none')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));

-- No client role writes any state-bearing table directly. `games` and `venues`
-- are anon-readable; nothing is anon-writable.
select pg_temp.ok(
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral (values ('anon'), ('authenticated')) as r(role),
     lateral (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege(r.role, c.oid, p.priv)) = 0,
  'no client role holds INSERT, UPDATE or DELETE on any table in public',
  (select coalesce(string_agg(distinct c.relname || ':' || r.role || ':' || p.priv, ', '), 'none')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral (values ('anon'), ('authenticated')) as r(role),
     lateral (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege(r.role, c.oid, p.priv)));

/*
 * service_role holds no UPDATE on bookings, deliberately.
 *
 * The E2E suite discovered this the hard way: it tried to fake an elapsed grace
 * window by updating a booking directly and got a silent permission error. The
 * absence is the design — a booking moves state through `expire_booking`,
 * `confirm_booking` and `cancel_booking`, and a server-side script that can
 * edit the row directly is a second, unaudited state machine.
 */
select pg_temp.ok(
  not has_table_privilege('service_role', 'public.bookings', 'UPDATE'),
  'service_role still holds NO UPDATE on bookings',
  'ACL: ' || (select array_to_string(relacl, ' ') from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'bookings'));

-- =============================================================================
-- 2. Every function is search_path-pinned; every WRITER is SECURITY DEFINER
--
-- An unqualified reference inside a SECURITY DEFINER function is resolved
-- against the caller's search_path, so a caller who can create a schema can
-- shadow `public` and have the definer run their table instead. `search_path
-- = ''` forces every reference to be schema-qualified, which is why the rule
-- is stated as both halves.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not (p.proconfig @> array['search_path=""'])) = 0,
  'every function in public pins search_path to the empty string',
  (select coalesce(string_agg(p.proname, ', '), 'none')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not (p.proconfig @> array['search_path=""'])));

/*
 * SECURITY INVOKER is correct for a function that performs no privileged
 * action, and five functions qualify. Asserting "everything is DEFINER" would
 * be wrong — `array_is_distinct` backs a CHECK constraint and must stay a pure
 * helper — so the assertion is that no INVOKER function writes state.
 */
select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
      and p.prosrc ~* '(insert into|update |delete from)') = 0,
  'no SECURITY INVOKER function writes state',
  (select coalesce(string_agg(p.proname, ', '), 'none')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef));

select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and p.prosrc ~* '(insert into|update |delete from)') > 0,
  'state-writing functions exist and are SECURITY DEFINER — not vacuous');

-- =============================================================================
-- 3. game_organizer_contacts is invisible to clients
--
-- The organizer's phone number is a real person's mobile. It is not withheld
-- by a policy on a readable table — the table is not granted to a client role
-- at all, so the refusal happens on privileges before RLS is consulted.
-- =============================================================================

select pg_temp.ok(
  not has_table_privilege('anon', 'public.game_organizer_contacts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.game_organizer_contacts', 'SELECT'),
  'game_organizer_contacts grants nothing to anon or authenticated',
  'ACL: ' || (select array_to_string(relacl, ' ') from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'game_organizer_contacts'));

-- =============================================================================
-- 4. game_organizer_public exposes the NAME and only the name
-- =============================================================================

select pg_temp.ok(
  (select pg_get_function_result(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'game_organizer_public') = 'text',
  'game_organizer_public returns a single text value, not a row');

select pg_temp.ok(
  (select p.prosrc !~* 'organizer_phone' from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'game_organizer_public'),
  'game_organizer_public never reads organizer_phone');

select pg_temp.ok(
  has_function_privilege('anon', 'public.game_organizer_public(uuid)', 'EXECUTE'),
  'anon may call game_organizer_public — the name is public by design');

-- =============================================================================
-- 5. game_organizer_phone — identity from the session, never from an argument
--
-- The signature takes only a game id. A `p_player_id` parameter would be a
-- parameter someone can change: the whole guarantee is that the caller cannot
-- state who they are.
-- =============================================================================

select pg_temp.ok(
  (select pg_get_function_identity_arguments(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'game_organizer_phone') = 'p_game_id uuid',
  'game_organizer_phone takes ONLY a game id — identity cannot be passed in');

select pg_temp.ok(
  (select p.prosrc ~ 'auth\.uid\(\)' from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'game_organizer_phone'),
  'game_organizer_phone reads identity from auth.uid()');

select pg_temp.ok(
  not has_function_privilege('anon', 'public.game_organizer_phone(uuid)', 'EXECUTE'),
  'anon has no EXECUTE on game_organizer_phone at all',
  'ACL: ' || (select coalesce(array_to_string(p.proacl, ' '), 'default')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'game_organizer_phone'));

-- --- fixture: a game with an active booking AND an organizer contact --------
-- No seeded game has both, so the contact is created here and rolled back.
create temp table _fx (game_id uuid, holder uuid, outsider uuid) on commit drop;

insert into _fx (game_id, holder)
select b.game_id, p.auth_user_id
from public.bookings b
join public.players p on p.id = b.player_id
where b.status in ('reserved', 'confirmed') and p.auth_user_id is not null
limit 1;

-- A player with NO booking on that game.
update _fx set outsider = (
  select p.auth_user_id from public.players p
  where p.auth_user_id is not null
    and not exists (
      select 1 from public.bookings b
      where b.game_id = (select game_id from _fx) and b.player_id = p.id
        and b.status in ('reserved', 'confirmed'))
  limit 1);

insert into public.game_organizer_contacts (game_id, organizer_name, organizer_phone)
values ((select game_id from _fx), 'Conformance Organizer', '+420700000000');

/*
 * The fixture ids travel in GUCs, not in the temp table.
 *
 * `_fx` is owned by postgres, so a probe running under `set local role anon`
 * cannot read it — the suite would fail with "permission denied for table _fx"
 * before reaching the thing it means to test. A custom GUC is readable by
 * every role and is reset by the rollback along with everything else.
 */
select set_config('conformance.game_id', (select game_id from _fx)::text, true);
select set_config('conformance.holder',  (select holder  from _fx)::text, true);
select set_config('conformance.outsider',(select outsider from _fx)::text, true);

select pg_temp.ok((select count(*) from _fx where game_id is not null
                     and holder is not null and outsider is not null) = 1,
  'fixture: a game with an active booking, a holder and an outsider');

-- The holder gets the number.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('conformance.holder')::uuid)::text, true);
select pg_temp.ok(
  pg_temp.call($q$select public.game_organizer_phone(current_setting('conformance.game_id')::uuid)$q$)
    = '+420700000000',
  'a holder of an active booking receives the organizer phone',
  pg_temp.call($q$select public.game_organizer_phone(current_setting('conformance.game_id')::uuid)$q$));
reset role;

-- A signed-in player without a booking on that game gets null. Asserted
-- separately from the anon case: they are different refusals, and only this one
-- goes through the function body rather than the grant.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('conformance.outsider')::uuid)::text, true);
select pg_temp.ok(
  pg_temp.call($q$select public.game_organizer_phone(current_setting('conformance.game_id')::uuid)$q$) = 'null',
  'a signed-in player WITHOUT a booking on that game receives null');
reset role;

select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- 6. anon cannot reach organizer_phone by ANY of the four route shapes
--
-- Each is a different mechanism, and closing three of them is not closing the
-- fourth.
-- =============================================================================

set local role anon;

-- Route 1: the base table.
select pg_temp.ok(
  pg_temp.call(
    $q$select count(_p::text) from (select organizer_phone from public.game_organizer_contacts) _p$q$
  ) = 'denied',
  'route 1/4 — the base table is denied to anon');

-- Route 2: PostgREST-style column selection on the same table.
select pg_temp.ok(
  pg_temp.call(
    $q$select count(_p::text) from (select c.organizer_phone from public.game_organizer_contacts c where c.game_id = current_setting('conformance.game_id')::uuid) _p$q$
  ) = 'denied',
  'route 2/4 — selecting the column by name is denied to anon');

-- Route 3: the public projection, which anon MAY call — and which cannot
-- return a phone because it never reads one.
select pg_temp.ok(
  pg_temp.call($q$select public.game_organizer_public(current_setting('conformance.game_id')::uuid)$q$)
    in ('Conformance Organizer', 'null'),
  'route 3/4 — the public projection returns a name, never a number',
  pg_temp.call($q$select public.game_organizer_public(current_setting('conformance.game_id')::uuid)$q$));

-- Route 4: the phone function itself.
select pg_temp.ok(
  pg_temp.call($q$select public.game_organizer_phone(current_setting('conformance.game_id')::uuid)$q$) = 'denied',
  'route 4/4 — the phone function is denied to anon');

reset role;

-- =============================================================================
-- 7. WHY THE CAST IS LOAD-BEARING — demonstrated, not asserted from memory
--
-- REQ-SEC-001/REQ-DB-003 ask that replacing `count(_p::text)` with `count(*)`
-- makes the probe stop detecting a revoked privilege. Rather than take that on
-- trust, both variants run here against the same denied function, and the suite
-- asserts they DISAGREE.
--
-- count(*)        -> '1'       the planner pruned the call; nothing was checked
-- count(_p::text) -> 'denied'  the value was consumed, so the call had to run
--
-- If this ever stops disagreeing — a planner change, a volatility change — the
-- probe below fails, and that is the signal to re-examine every suite that
-- relies on the cast.
-- =============================================================================

set local role anon;

select pg_temp.ok(
  pg_temp.call(
    $q$select count(*) from (select public.waitlist_position(current_setting('conformance.game_id')::uuid)) _p$q$
  ) = '1',
  'count(*) reports SUCCESS for a call anon may not make — the false pass',
  pg_temp.call($q$select count(*) from (select public.waitlist_position(current_setting('conformance.game_id')::uuid)) _p$q$));

select pg_temp.ok(
  pg_temp.call(
    $q$select count(_p::text) from (select public.waitlist_position(current_setting('conformance.game_id')::uuid)) _p$q$
  ) = 'denied',
  'count(_p::text) reports DENIED for the same call — the cast forces evaluation');

select pg_temp.ok(
  pg_temp.call($q$select count(*) from (select public.waitlist_position(current_setting('conformance.game_id')::uuid)) _p$q$)
  <> pg_temp.call($q$select count(_p::text) from (select public.waitlist_position(current_setting('conformance.game_id')::uuid)) _p$q$),
  'the two variants DISAGREE — which is the whole reason the cast is mandatory');

reset role;

-- =============================================================================
-- 8. The waitlist survives the removal of the admin depth panel
--
-- Ruling: the panel goes, the data does not. Removing a surface that reads a
-- table is not a reason to stop maintaining the table, and a waitlist that
-- quietly stopped being written would only be noticed when a game filled.
-- =============================================================================

select pg_temp.ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'waitlist' and c.relkind = 'r') = 1,
  'the waitlist table still exists');

select pg_temp.ok(
  (select count(*) from public.waitlist) >= 0,
  'the waitlist is queryable',
  (select 'rows: ' || count(*)::text from public.waitlist));

select pg_temp.ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'game_waitlist_public' and c.relkind = 'v') = 1,
  'game_waitlist_public still projects the queue');

select pg_temp.ok(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'game_waitlist_public'
      and column_name in ('player_id', 'joined_at')) = 0,
  'game_waitlist_public withholds player_id and joined_at — order without timestamps');

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
