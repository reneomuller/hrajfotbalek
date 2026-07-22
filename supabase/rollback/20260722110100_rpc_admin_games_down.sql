-- Rollback for 20260722110100_rpc_admin_games.sql

drop function if exists public.admin_update_game(uuid, uuid, timestamptz, integer, text, text, text);
drop function if exists public.admin_create_game(uuid, timestamptz, integer, integer, text, text, text);
drop function if exists public.admin_create_venue(text, text, text);
