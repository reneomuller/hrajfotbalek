-- Rollback for 20260720150000_service_role_grants.sql
--
-- Restores the pre-migration state, in which service_role could not SELECT any
-- table. Note that this re-breaks every server-side read (admin panel, stats,
-- seed) — PostgREST stops exposing the tables entirely.

revoke select on public.game_roster_public from service_role;
revoke select on public.events        from service_role;
revoke select on public.waitlist      from service_role;
revoke select on public.credit_ledger from service_role;
revoke select on public.bookings      from service_role;
revoke insert, update, select on public.games   from service_role;
revoke insert, update, select on public.players from service_role;

notify pgrst, 'reload schema';
