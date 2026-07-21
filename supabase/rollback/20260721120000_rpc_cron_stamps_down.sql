-- Rollback for 20260721120000_rpc_cron_stamps.sql

drop function if exists public.mark_nudged(uuid, integer);
drop function if exists public.mark_reminder_sent(uuid);
