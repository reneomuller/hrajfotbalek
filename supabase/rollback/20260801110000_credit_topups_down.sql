-- Rollback for 20260801110000_credit_topups.sql
--
-- Drops the table, which drops the top-up records. The LEDGER rows it wrote are
-- deliberately left alone: they are money credited to real wallets, and a
-- rollback that removes them takes balance away from players who paid for it.
-- Their `reason = 'topup'` outlives the table that explains them, which is the
-- correct trade — an unexplained credit is recoverable, a missing one is not.

drop function if exists public.confirm_topup(uuid, uuid, integer);
drop type if exists public.topup_result;
drop function if exists public.create_topup(integer);

drop table if exists public.credit_topups;
drop type if exists public.topup_status;

drop function if exists public.next_topup_code();
drop sequence if exists public.topup_payment_code_seq;
