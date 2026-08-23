-- Rollback for 20260823110000_policy_v3_eight_hours (policy v3 -> v2).
--
-- IT IS NOT A CLEAN UNDO AND MUST NOT PRETEND TO BE. Cancellations that
-- happened under v3 are stamped 'v3' and stay stamped: they were adjudicated
-- under an 8-hour rule and re-labelling them v2 would make the log answer the
-- wrong question. Only the DEFAULT for future rows goes back.
--
-- Re-apply 20260819120000_cancel_cutoff_ten_hours.sql to restore the 10-hour
-- function body — it is the authority for that version and restating it here
-- would be a third hand-kept copy of the same money rule.
drop function if exists public.cancellation_refund_cutoff_hours();
alter table public.events         alter column policy_version set default 'v2';
alter table public.credit_topups  alter column policy_version set default 'v2';
