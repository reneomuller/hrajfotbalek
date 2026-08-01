-- Rollback for 20260802160000_pass_money_path.sql
--
-- RESTORING `create_booking` AND `cancel_booking` IS NOT DONE HERE, and that
-- is deliberate rather than an omission. Both were `create or replace`d on an
-- identical signature, so the way back is to re-run the migration that last
-- defined them — 20260720110000 and 20260720120000 — as a gated migration
-- written against the data that exists at the time.
--
-- Copying two hundred lines of Phase 1 money code into a rollback file would
-- create a SECOND definition of the booking path that has to be kept in step
-- with the first, and the first time they disagreed the wrong one would be the
-- one nobody was reading. A pointer that is always right beats a copy that
-- rots.
--
-- The functions below are new in migration 33 and are dropped cleanly.

drop function if exists public.batches_expiring_soon(integer);
drop function if exists public.expire_credit_batches();

-- A distinct function rather than an overload, so it drops cleanly and
-- migration 25's `create_topup(integer)` is untouched.
drop function if exists public.create_pass_topup(integer);

drop function if exists public.apply_credit(uuid, uuid, integer);

-- `confirm_topup` keeps its migration-25 signature and was replaced in place.
-- Same reasoning as create_booking: re-run 20260801110000 to restore it.
