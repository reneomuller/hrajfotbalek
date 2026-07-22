-- Rollback for 20260722130000_rpc_admin_players.sql

drop function if exists public.merge_players(uuid, uuid);
drop function if exists public.grant_credit(uuid, integer, public.credit_reason, boolean, text);
