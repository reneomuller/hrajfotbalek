-- Rollback for 20260720110000_rpc_create_booking.sql
-- Reverse dependency order: entry point, shared body, helpers, then the type.

drop function if exists public.create_booking(uuid, public.payment_method, uuid, uuid);
drop function if exists public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean);
drop function if exists public.sync_game_fullness(uuid);
drop function if exists public.is_service_role();
drop function if exists public.is_admin_caller();
drop function if exists public.current_player_id();
drop type if exists public.booking_result;
