-- Rollback for 20260720150100_service_role_delete_grants.sql
--
-- Removes service_role's DELETE. `npm run seed:reset` stops working; the
-- append-only guarantee on credit_ledger and events becomes absolute again.

revoke delete on public.events        from service_role;
revoke delete on public.credit_ledger from service_role;
revoke delete on public.waitlist      from service_role;
revoke delete on public.bookings      from service_role;
revoke delete on public.games         from service_role;
revoke delete on public.players       from service_role;

notify pgrst, 'reload schema';
