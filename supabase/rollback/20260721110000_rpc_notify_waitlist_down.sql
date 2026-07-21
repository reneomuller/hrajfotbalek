-- Rollback for 20260721110000_rpc_notify_waitlist.sql

drop function if exists public.notify_waitlist(uuid);
drop type if exists public.waitlist_notification;
