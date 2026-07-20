-- Rollback for 20260720120000_rpc_cancel_booking.sql

drop function if exists public.cancel_booking(uuid);
drop type if exists public.cancel_result;
