-- Rollback for 20260722100000_rpc_waitlist_position.sql

drop function if exists public.waitlist_position(uuid);
