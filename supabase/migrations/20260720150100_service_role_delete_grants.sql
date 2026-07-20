-- =============================================================================
-- Migration 10 — DELETE privilege for service_role (fixture reset)
--
-- Follow-up to migration 9. That migration granted SELECT and, for the base-row
-- tables, INSERT/UPDATE. It did not grant DELETE, because the ACL string
-- `service_role=Dxtm` looked like it already included it. It does not:
-- in a Postgres aclitem, lowercase `d` is DELETE and uppercase `D` is TRUNCATE.
-- service_role had TRUNCATE, REFERENCES, TRIGGER and MAINTAIN, and no DELETE.
--
-- `npm run seed:reset` needs DELETE to be idempotent. It cannot lean on
-- cascades: events.player_id / game_id / booking_id are all ON DELETE SET NULL,
-- so deleting players and games would leave orphaned event rows behind, which
-- accumulate on every reseed and break both the fixture counts and the
-- "seed writes no synthetic events" check.
--
-- A TRADE-OFF WORTH NAMING, because it touches a core invariant:
--
-- `credit_ledger` and `events` are append-only. Granting DELETE to service_role
-- weakens that — for service_role only. It stays fully enforced against anon
-- and authenticated, which are the roles any client can actually reach, and
-- those are where the invariant does its work. The service-role key is a
-- server-only, full-trust credential.
--
-- The alternative considered and rejected: a reset_seed_fixtures() RPC. That
-- would have been WORSE, because a SECURITY DEFINER function has to be callable
-- by someone — in practice an admin session — which would hand a destructive,
-- id-scoped delete capability to any authenticated admin JWT. Keeping the
-- capability attached to the server-only key is the narrower blast radius.
--
-- If you would rather the seed not be resettable at all, drop this migration;
-- everything except `npm run seed:reset` keeps working.
--
-- Rollback: supabase/rollback/20260720150100_service_role_delete_grants_down.sql
-- =============================================================================

grant delete on public.players       to service_role;
grant delete on public.games         to service_role;
grant delete on public.bookings      to service_role;
grant delete on public.credit_ledger to service_role;
grant delete on public.waitlist      to service_role;
grant delete on public.events        to service_role;

notify pgrst, 'reload schema';
