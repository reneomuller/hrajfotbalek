-- Rollback for 20260721100000_rpc_join_waitlist.sql

drop function if exists public.join_waitlist(uuid);
drop type if exists public.waitlist_join_result;
