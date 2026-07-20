-- Rollback for 20260720100100_bookings_ledger_waitlist.sql
-- Drops in reverse dependency order: view -> FK back-reference -> waitlist ->
-- credit_ledger -> bookings -> sequence + helper -> enums.

drop view if exists public.game_roster_public;

alter table if exists public.events
  drop constraint if exists events_booking_id_fkey;

drop table if exists public.waitlist cascade;
drop table if exists public.credit_ledger cascade;
drop table if exists public.bookings cascade;

drop function if exists public.next_payment_code();
drop sequence if exists public.booking_payment_code_seq;

drop type if exists public.credit_reason;
drop type if exists public.attendance_status;
drop type if exists public.payment_method;
drop type if exists public.booking_status;
