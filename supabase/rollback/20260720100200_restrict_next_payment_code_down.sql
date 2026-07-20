-- Rollback for 20260720100200_restrict_next_payment_code.sql
--
-- Restores the Postgres default (EXECUTE to PUBLIC) that migration 2 left in
-- place. Note this is a genuine widening: it hands the sequence-burning call
-- back to anon and authenticated. Roll back only to reproduce the pre-fix
-- state, not as a routine step.

revoke execute on function public.next_payment_code() from service_role;

grant execute on function public.next_payment_code() to public;
