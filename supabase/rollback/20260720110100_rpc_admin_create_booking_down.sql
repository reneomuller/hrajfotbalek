-- Rollback for 20260720110100_rpc_admin_create_booking.sql

drop function if exists public.admin_create_booking(uuid, uuid, public.payment_method);
