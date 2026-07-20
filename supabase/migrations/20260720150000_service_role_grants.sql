-- =============================================================================
-- Migration 9 — explicit service_role privileges
--
-- WHY THIS EXISTS
--
-- This project has "automatically expose new tables" DISABLED and automatic
-- RLS ENABLED. The consequence, discovered while running the Phase 9 seed:
-- every table created by migrations 1 and 2 ended up with
--
--     service_role=Dxtm/postgres
--
-- i.e. DELETE, TRUNCATE, REFERENCES, TRIGGER — and NOT select, insert or
-- update. Migrations 1 and 2 revoked only from anon and authenticated, so this
-- was not self-inflicted; it is the project setting.
--
-- The failure mode is nasty because it is silent in the wrong direction:
-- PostgREST only exposes a table to a role that can SELECT it, so a
-- service-role request to /rest/v1/events came back "Invalid path specified in
-- request URL" — indistinguishable from a typo, and nothing like "permission
-- denied". Left alone, every server-side read in the admin panel (Phases
-- 21-26) and the stats surface (Phase 26) would have returned nothing, or
-- 404'd, with no obvious cause.
--
-- WHAT IS GRANTED, AND WHAT DELIBERATELY IS NOT
--
--   SELECT on everything — server-side reads: admin panel, stats, seed
--   verification. This is the capability that was actually missing.
--
--   INSERT/UPDATE on players and games ONLY. These are the base-row tables:
--   the seed inserts them directly and Phase 21's games CRUD edits them.
--
--   NO insert or update on bookings, credit_ledger, waitlist or events. Those
--   are state-bearing, and every write to them must go through a
--   SECURITY DEFINER RPC that authorizes internally. Withholding the privilege
--   makes "the service-role key grants reach, not permission" an enforced
--   property rather than a convention someone has to remember. A future
--   contributor reaching for a direct insert gets a hard error, not a
--   working shortcut.
--
-- Rollback: supabase/rollback/20260720150000_service_role_grants_down.sql
-- =============================================================================

grant select on public.players       to service_role;
grant select on public.games         to service_role;
grant select on public.bookings      to service_role;
grant select on public.credit_ledger to service_role;
grant select on public.waitlist      to service_role;
grant select on public.events        to service_role;
grant select on public.game_roster_public to service_role;

-- Base rows only.
grant insert, update on public.players to service_role;
grant insert, update on public.games   to service_role;

-- Stated explicitly rather than left implicit: these are the tables whose
-- writes must stay inside the RPCs.
revoke insert, update on public.bookings      from service_role;
revoke insert, update on public.credit_ledger from service_role;
revoke insert, update on public.waitlist      from service_role;
revoke insert, update on public.events        from service_role;

-- PostgREST caches the schema; without this the grants above are invisible to
-- the API until the next reload.
notify pgrst, 'reload schema';
