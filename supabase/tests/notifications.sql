-- Notifications, v1 (round 7 item 5): RLS, grants and RPC authorization.
--
-- THE GRANT ASSERTIONS USE `set local role`, NOT A JWT CLAIM. A claim does not
-- change the database role, so a probe run on the owning connection asserts the
-- owner's privileges and reports them as the client's — the count(*) lesson in
-- different clothes.

begin;

/*
 * pgTAP LIVES IN ITS OWN SCHEMA, and that is not tidiness (round 12, item 4).
 *
 * This suite had never actually run: pgTAP was not installed, so every
 * invocation died on `function plan(integer) does not exist` and the suite
 * counted as failed for a reason nobody had read in months.
 *
 * Installing it into `public` fixed that and broke something else — pgTAP is
 * ~1080 functions, and `v13_conformance/security.sql` enumerates every
 * function in `public` to assert that no SECURITY INVOKER one writes state.
 * A test harness that changes what the conformance suites see is a harness
 * that can hide a real finding, so it goes in `tap` and `public` keeps its 64.
 *
 * The search_path is set for this transaction only. `public` stays FIRST so
 * that an unqualified table name in an assertion still means the product's.
 */
set local search_path = public, tap;

select plan(9);

-- The store exists and is the shape the bell reads.
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'user_notification_reads', 'read receipts table exists');

-- No client writes: SELECT and nothing else.
select bag_eq(
  $$ select privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='notifications'
        and grantee='authenticated'
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE') $$,
  $$ values ('SELECT') $$,
  'authenticated may only read notifications'
);
select bag_eq(
  $$ select privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='user_notification_reads'
        and grantee='authenticated'
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE') $$,
  $$ values ('SELECT') $$,
  'authenticated may only read their receipts'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
  'RLS is on for notifications'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_notification_reads'::regclass),
  'RLS is on for read receipts'
);

-- A blank title is refused at the RPC, not merely in the form.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$ select public.admin_create_notification('   ', 'body') $$,
  'NOTIFICATION_TITLE_REQUIRED',
  'a blank title is refused'
);

-- And a non-admin cannot publish, whatever the route did or did not check.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_create_notification('t', 'b') $$,
  'INSUFFICIENT_PERMISSION',
  'a non-admin cannot publish a notification'
);

-- `count(_p::text)`, not `count(*)`: the planner prunes a non-volatile call out
-- of a count(*) plan and the privilege check never runs.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$ with _p as (select public.my_notifications(5)) select count(_p::text) from _p $$,
  'my_notifications is callable and is actually evaluated'
);

select * from finish();
rollback;
