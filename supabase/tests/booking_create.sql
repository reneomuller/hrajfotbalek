-- =============================================================================
-- Phase 5 assertions — create_booking + admin_create_booking
--
-- Run:  psql "$SUPABASE_DB_URL" -f supabase/tests/booking_create.sql
--
-- Transaction-wrapped and rolled back. Asserts DATABASE STATE, never timing.
--
-- Scope note: the genuine concurrency races (two callers contending for the
-- last spot; one player spending one balance across two games at once) cannot
-- be expressed from a single session — one session cannot block against
-- itself, and an advisory lock taken twice in one transaction is simply
-- re-entrant. Those two live in supabase/tests/concurrency/booking_race.mjs,
-- which drives real concurrent connections. This file covers everything that
-- is decidable sequentially, which is the large majority of the contract.
-- =============================================================================

begin;

-- --- harness -----------------------------------------------------------------

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

-- Returns rows:N | denied | raise:<message> | error:<sqlstate>.
-- The `raise:` form matters here: this phase's contract is expressed almost
-- entirely in named errors (CAPACITY_FULL, DUPLICATE_ACTIVE_BOOKING,
-- INSUFFICIENT_PERMISSION), so asserting the MESSAGE rather than a generic
-- "it failed" is what makes these assertions worth anything.
create function pg_temp.probe(sql text)
returns text language plpgsql as $$
declare n integer;
begin
  -- A CTE, not a subquery: this wrapper has to accept INSERT/UPDATE ...
  -- RETURNING as well as SELECT, and only a data-modifying CTE allows that.
  --
  -- The rows are CONSUMED, not just counted. `count(*)` never reads a column
  -- of the CTE, so for a non-volatile function under test the planner prunes
  -- the call out of the plan entirely and the executor never performs the
  -- privilege check — the probe then reports `rows:1` where a direct call is
  -- denied, which is a FALSE PASS on exactly the assertions these suites exist
  -- to make. `count(<expr>)` must evaluate its argument, and casting the whole
  -- row to text drags every column (and therefore every function call) into
  -- that evaluation. Verified against `public.waitlist_position` as `anon`:
  -- count(*) says rows:1, count(_p::text) says denied. Wrapping the cast in a
  -- subquery is NOT enough — the pruning just moves up a level. Same reasoning
  -- as `call_position()` in waitlist_position.sql, which hit this first.
  -- `_p::text` is never NULL (an all-NULL row casts to '()'), so the count
  -- still equals the row count.
  execute 'with _p as (' || sql || ') select count(_p::text) from _p' into n;
  return 'rows:' || n;
exception
  when insufficient_privilege then return 'denied';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || sqlerrm; end if;
    return 'error:' || sqlstate;
end $$;

-- Evaluates `sql` EXACTLY ONCE and records both the verdict and what actually
-- happened. The naive form — pg_temp.ok(probe(x) = expected, label, probe(x))
-- — runs the statement twice, which is harmless for a probe that raises but
-- silently double-executes one that succeeds. SECURITY INVOKER on purpose, so
-- the probe still runs as the current test role; only pg_temp.ok (definer)
-- touches the results table.
create function pg_temp.ok_probe(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.probe(sql);
  perform pg_temp.ok(r = expected, label, r);
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
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a@test.invalid'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b@test.invalid'),
  ('c0000000-0000-0000-0000-0000000000c1', 'c@test.invalid'),
  ('50000000-0000-0000-0000-000000000051', 'seed@test.invalid'),
  ('d0000000-0000-0000-0000-0000000000d1', 'admin@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_seed, is_admin) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'TstPlayerA', 'a@test.invalid',     'a0000000-0000-0000-0000-0000000000a1', false, false),
  ('bbbb0000-0000-0000-0000-00000000000b', 'TstPlayerB', 'b@test.invalid',     'b0000000-0000-0000-0000-0000000000b1', false, false),
  ('cccc0000-0000-0000-0000-00000000000c', 'TstPlayerC', 'c@test.invalid',     'c0000000-0000-0000-0000-0000000000c1', false, false),
  ('55550000-0000-0000-0000-000000000055', 'TstSeedBot', 'seed@test.invalid',  '50000000-0000-0000-0000-000000000051', true,  false),
  ('dddd0000-0000-0000-0000-00000000000d', 'TstAdminM',  'admin@test.invalid', 'd0000000-0000-0000-0000-0000000000d1', false, true),
  -- Shadow: never logged in, no session, cannot act for itself.
  ('eeee0000-0000-0000-0000-00000000000e', 'TstShadowE', 'shadow@test.invalid', null, false, false);

insert into public.games (id, venue, starts_at, capacity, price_czk, status) values
  ('91110000-0000-0000-0000-000000000001', 'Cap Two',    now() + interval '7 days', 2,  200, 'published'),
  ('92220000-0000-0000-0000-000000000002', 'Roomy',      now() + interval '8 days', 10, 200, 'published'),
  ('93330000-0000-0000-0000-000000000003', 'Roomy Two',  now() + interval '9 days', 10, 200, 'published'),
  ('94440000-0000-0000-0000-000000000004', 'Draft Game', now() + interval '9 days', 10, 200, 'draft'),
  ('95550000-0000-0000-0000-000000000005', 'Waitlisted', now() + interval '9 days', 10, 200, 'published');

-- =============================================================================
-- payment_method derivation
-- =============================================================================

-- --- seed player -> seed_free, price 0, confirmed instantly, no VS ----------
select pg_temp.act_as('50000000-0000-0000-0000-000000000051');

select pg_temp.ok(
  (select (public.create_booking('92220000-0000-0000-0000-000000000002', 'qr')).payment_method) = 'seed_free',
  'seed player booking is derived seed_free (caller said qr)');

reset role;
select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = '55550000-0000-0000-0000-000000000055'
      and status = 'confirmed' and price_czk = 0 and payment_code is null) = 1,
  'seed booking is confirmed at price 0 with no VS');

-- --- full credit -> credit, confirmed instantly, no VS ----------------------
insert into public.credit_ledger (player_id, delta_czk, reason) values
  ('aaaa0000-0000-0000-0000-00000000000a', 200, 'admin_grant');

select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(
  (select (public.create_booking('92220000-0000-0000-0000-000000000002', 'qr')).payment_method) = 'credit',
  'full-balance booking is derived credit (caller said qr)');

reset role;
select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'aaaa0000-0000-0000-0000-00000000000a'
      and game_id = '92220000-0000-0000-0000-000000000002'
      and status = 'confirmed' and payment_code is null and credit_applied_czk = 200) = 1,
  'full-credit booking is confirmed, no VS, 200 credit applied');

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
    where player_id = 'aaaa0000-0000-0000-0000-00000000000a') = 0,
  'the wallet is drawn down to exactly 0, never below',
  'balance=' || (select coalesce(sum(delta_czk), 0) from public.credit_ledger
                  where player_id = 'aaaa0000-0000-0000-0000-00000000000a'));

-- --- partial credit -> keeps the caller's method, reduced amount_due --------
insert into public.credit_ledger (player_id, delta_czk, reason) values
  ('bbbb0000-0000-0000-0000-00000000000b', 50, 'admin_grant');

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(
  (select (public.create_booking('92220000-0000-0000-0000-000000000002', 'qr')).amount_due_czk) = 150,
  'partial credit reduces amount_due to 150 (200 price - 50 credit)');

reset role;
select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'bbbb0000-0000-0000-0000-00000000000b'
      and status = 'reserved' and payment_method = 'qr'
      and credit_applied_czk = 50 and payment_code is not null) = 1,
  'partial-credit booking keeps qr, stays reserved, and gets a VS');

-- --- cash reserves with no VS ------------------------------------------------
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(
  (select (public.create_booking('93330000-0000-0000-0000-000000000003', 'cash')).payment_code) is null,
  'a cash booking allocates no VS');
reset role;

-- =============================================================================
-- the narrowed client domain — credit / seed_free are never accepted
-- =============================================================================

select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');

select pg_temp.ok_probe(
  $q$select public.create_booking('92220000-0000-0000-0000-000000000002', 'credit')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a caller-supplied payment_method of credit is REJECTED, not downgraded');

select pg_temp.ok_probe(
  $q$select public.create_booking('92220000-0000-0000-0000-000000000002', 'seed_free')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a caller-supplied payment_method of seed_free is REJECTED');

reset role;
select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'cccc0000-0000-0000-0000-00000000000c'
      and game_id = '92220000-0000-0000-0000-000000000002') = 0,
  'no booking row was written by either rejected call');

-- =============================================================================
-- authorization
-- =============================================================================

-- Cross-user: naming another player's id is refused rather than silently
-- succeeding under the caller's own identity.
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok_probe(
  $q$select public.create_booking('93330000-0000-0000-0000-000000000003', 'qr', null,
                                  'aaaa0000-0000-0000-0000-00000000000a')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'create_booking naming another player''s id is rejected');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'aaaa0000-0000-0000-0000-00000000000a'
      and game_id = '93330000-0000-0000-0000-000000000003') = 0,
  'the cross-user attempt wrote no booking for the named victim');

-- A session with no player row at all.
-- anon has no EXECUTE grant, so this is `denied` rather than a raise. Asserting
-- the exact outcome, not "either is fine": if EXECUTE were ever granted to
-- anon, the INSUFFICIENT_PERMISSION raise inside would still stop it, but the
-- grant itself would be a regression worth failing on.
set local role anon;
select pg_temp.ok_probe(
  $q$select public.create_booking('92220000-0000-0000-0000-000000000002', 'qr')$q$,
  'denied',
  'an anonymous caller cannot create a booking');
reset role;

-- The shared internal body is not callable directly by clients.
set local role authenticated;
select pg_temp.ok_probe(
  $q$select public.create_booking_internal('92220000-0000-0000-0000-000000000002',
    'aaaa0000-0000-0000-0000-00000000000a', 'qr', null, false)$q$,
  'denied',
  'create_booking_internal is not directly callable (it authorizes nothing)');
reset role;

-- =============================================================================
-- duplicates, capacity, game state
-- =============================================================================

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok_probe(
  $q$select public.create_booking('92220000-0000-0000-0000-000000000002', 'qr')$q$,
  'raise:DUPLICATE_ACTIVE_BOOKING',
  'a second active booking for the same (game, player) raises DUPLICATE_ACTIVE_BOOKING');

select pg_temp.ok_probe(
  $q$select public.create_booking('94440000-0000-0000-0000-000000000004', 'qr')$q$,
  'raise:GAME_NOT_BOOKABLE',
  'a draft game cannot be booked');
reset role;

-- Fill the capacity-2 game sequentially, then overflow it.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
select public.create_booking('91110000-0000-0000-0000-000000000001', 'cash');
reset role;
select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select public.create_booking('91110000-0000-0000-0000-000000000001', 'cash');
reset role;

select pg_temp.ok(
  (select status from public.games where id = '91110000-0000-0000-0000-000000000001') = 'full',
  'the game flips published -> full when the last spot is taken');

select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok_probe(
  $q$select public.create_booking('91110000-0000-0000-0000-000000000001', 'cash')$q$,
  'raise:CAPACITY_FULL',
  'booking past capacity raises CAPACITY_FULL');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where game_id = '91110000-0000-0000-0000-000000000001'
      and status in ('reserved', 'confirmed')) = 2,
  'capacity 2 holds exactly 2 active bookings after the overflow attempt',
  'active=' || (select count(*) from public.bookings
                 where game_id = '91110000-0000-0000-0000-000000000001'
                   and status in ('reserved', 'confirmed')));

-- =============================================================================
-- waitlist conversion
-- =============================================================================

insert into public.waitlist (id, game_id, player_id) values
  ('77770000-0000-0000-0000-000000000077', '95550000-0000-0000-0000-000000000005',
   'cccc0000-0000-0000-0000-00000000000c');

select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select public.create_booking('95550000-0000-0000-0000-000000000005', 'cash', '77770000-0000-0000-0000-000000000077');
reset role;

select pg_temp.ok(
  (select converted_booking_id is not null from public.waitlist
    where id = '77770000-0000-0000-0000-000000000077'),
  'from_waitlist_id sets converted_booking_id');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'waitlist_converted'
      and game_id = '95550000-0000-0000-0000-000000000005') = 1,
  'waitlist_converted is emitted in the same transaction as booking_created');

-- Converting somebody else's waitlist entry is refused.
insert into public.waitlist (id, game_id, player_id) values
  ('77880000-0000-0000-0000-000000000078', '93330000-0000-0000-0000-000000000003',
   'aaaa0000-0000-0000-0000-00000000000a');

select pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
select pg_temp.ok_probe(
  $q$select public.create_booking('93330000-0000-0000-0000-000000000003', 'cash',
                                  '77880000-0000-0000-0000-000000000078')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'converting another player''s waitlist entry is rejected');
reset role;

-- =============================================================================
-- events
-- =============================================================================

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'booking_created'
      and player_id = '55550000-0000-0000-0000-000000000055') = 1,
  'booking_created is written for the seed booking');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'payment_confirmed'
      and player_id = '55550000-0000-0000-0000-000000000055') = 1,
  'payment_confirmed is written for an instant-confirm booking');

select pg_temp.ok(
  (select count(*) from public.events
    where event_type = 'credit_redeemed'
      and player_id = 'aaaa0000-0000-0000-0000-00000000000a') = 1,
  'credit_redeemed is written when credit is applied');

-- =============================================================================
-- admin_create_booking
-- =============================================================================

-- Non-admin rejection.
select pg_temp.act_as('c0000000-0000-0000-0000-0000000000c1');
select pg_temp.ok_probe(
  $q$select public.admin_create_booking('93330000-0000-0000-0000-000000000003',
    'eeee0000-0000-0000-0000-00000000000e', 'cash')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin calling admin_create_booking is rejected');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'eeee0000-0000-0000-0000-00000000000e') = 0,
  'the rejected admin call wrote no booking');

-- Admin books a shadow player.
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select public.admin_create_booking('93330000-0000-0000-0000-000000000003',
  'eeee0000-0000-0000-0000-00000000000e', 'cash');
reset role;

select pg_temp.ok(
  (select count(*) from public.bookings
    where player_id = 'eeee0000-0000-0000-0000-00000000000e'
      and booked_by_admin = true) = 1,
  'an admin books a shadow player (null auth_user_id) with booked_by_admin set');

select pg_temp.ok(
  (select count(*) from public.events
    where player_id = 'eeee0000-0000-0000-0000-00000000000e'
      and event_type = 'booking_created') = 1
  and (select count(*) from public.events
    where player_id = 'eeee0000-0000-0000-0000-00000000000e'
      and event_type = 'admin_booking_created') = 1,
  'BOTH booking_created and admin_booking_created are emitted in one transaction');

-- Service role is a permitted context.
-- This is the one state-CHANGING probe that is expected to succeed, so it is
-- also the one where double-evaluation would have corrupted the run: the
-- second call would hit DUPLICATE_ACTIVE_BOOKING against the row the first
-- call had just written. ok_probe evaluates once.
select pg_temp.act_as_service();
select pg_temp.ok_probe(
  $q$select public.admin_create_booking('93330000-0000-0000-0000-000000000003',
    'bbbb0000-0000-0000-0000-00000000000b', 'cash')$q$,
  'rows:1',
  'a service-role context may call admin_create_booking');
reset role;

-- Admin privilege does not widen the payment_method domain.
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok_probe(
  $q$select public.admin_create_booking('95550000-0000-0000-0000-000000000005',
    'eeee0000-0000-0000-0000-00000000000e', 'seed_free')$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'an admin may not assert seed_free either — it stays derived');

-- An admin booking a SEED player still gets seed_free, by derivation.
select pg_temp.ok(
  (select (public.admin_create_booking('95550000-0000-0000-0000-000000000005',
    '55550000-0000-0000-0000-000000000055', 'cash')).payment_method) = 'seed_free',
  'an admin booking a seed player gets seed_free because is_seed says so');
reset role;

-- Shared internals: the same capacity rule applies through the admin path.
select pg_temp.act_as('d0000000-0000-0000-0000-0000000000d1');
select pg_temp.ok_probe(
  $q$select public.admin_create_booking('91110000-0000-0000-0000-000000000001',
    'eeee0000-0000-0000-0000-00000000000e', 'cash')$q$,
  'raise:CAPACITY_FULL',
  'admin_create_booking enforces CAPACITY_FULL identically (shared internals)');

select pg_temp.ok_probe(
  $q$select public.admin_create_booking('93330000-0000-0000-0000-000000000003',
    'eeee0000-0000-0000-0000-00000000000e', 'cash')$q$,
  'raise:DUPLICATE_ACTIVE_BOOKING',
  'admin_create_booking enforces DUPLICATE_ACTIVE_BOOKING identically');
reset role;

-- =============================================================================
-- ledger integrity
-- =============================================================================

select pg_temp.ok(
  not exists (
    select 1 from public.credit_ledger
    group by player_id having sum(delta_czk) < 0),
  'no player''s ledger sums below zero anywhere in this run');

-- =============================================================================
-- THE CALLING CONTRACT — round 13, item 23
--
-- The reported defect was "credit redemption fails with Try again", and the
-- first hypothesis was signature drift: round 11 dropped the four-argument
-- `create_booking` for a five-argument one and round 12 made it six, so a
-- caller still sending the old shape would fail with exactly that message.
--
-- It was not the cause — the function resolves and works, on production, for a
-- real player with a real balance. But the hypothesis was worth a test,
-- because the failure mode is real, it is silent, and NOTHING in this
-- repository was checking it: the application names its arguments and the
-- database names its parameters, and the two agree only by memory.
--
-- SO THE CONTRACT IS ASSERTED FROM BOTH ENDS. If `app/game/[id]/book/actions.ts`
-- or `app/game/[id]/waitlist/actions.ts` ever sends a name this function does
-- not have, PostgREST answers PGRST202 and the player sees "Try again" with
-- nothing in the logs to say why.
-- =============================================================================

-- Exactly one overload. Two would let a stale caller keep working against the
-- old one, which is worse than failing: it books with the wrong defaults.
select pg_temp.ok(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_booking') = 1,
  'create_booking has exactly one overload');

-- Every name the application sends, and the two it may omit.
select pg_temp.ok(
  (select array_agg(a order by a) from unnest(
     (select proargnames from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_booking')) a)
  = array['p_from_waitlist_id', 'p_game_id', 'p_guest_count', 'p_online',
          'p_payment_method', 'p_player_id'],
  'create_booking names exactly the parameters its callers send');

-- The two the callers ALWAYS send must be the two without defaults, so a call
-- that omits everything else still resolves.
select pg_temp.ok(
  (select pronargs - pronargdefaults from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_booking') = 2,
  'only p_game_id and p_payment_method are required; the rest default');

-- =============================================================================
-- results
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
