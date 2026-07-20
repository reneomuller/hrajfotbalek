-- =============================================================================
-- Migration 3 — restrict execute on public.next_payment_code()
--
-- Follow-up tidy-up to migration 2, which created the function without an
-- explicit privilege grant. Postgres defaults EXECUTE on new functions to
-- PUBLIC, so `anon` and `authenticated` could both call it.
--
-- Calling it is not a read — it is `nextval`, which BURNS a variable symbol.
-- Since the sequence is `no cycle` and symbols are never reused, an anonymous
-- caller looping on this function advances the counter permanently and, at the
-- limit, exhausts it into a hard error. The value returned is not sensitive;
-- the side effect is.
--
-- The Phase 5 booking RPCs are unaffected: they are SECURITY DEFINER and
-- execute as their owner, not as the calling role.
--
-- Rollback: supabase/rollback/20260720100200_restrict_next_payment_code_down.sql
-- =============================================================================

revoke execute on function public.next_payment_code() from public;

grant execute on function public.next_payment_code() to service_role;
