-- Rollback for 20260720130000_booking_rpcs_b.sql

drop function if exists public.set_game_capacity(uuid, integer);
drop function if exists public.cancel_game(uuid);
drop function if exists public.settle_game(uuid);
drop function if exists public.mark_game_played(uuid);
drop function if exists public.publish_game(uuid);
drop function if exists public.expire_booking(uuid);
drop function if exists public.confirm_booking(uuid, uuid, integer);
drop type if exists public.confirm_result;
