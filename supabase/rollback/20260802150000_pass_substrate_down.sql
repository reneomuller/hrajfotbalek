-- Rollback for 20260802150000_pass_substrate.sql
--
-- MUST BE RUN AFTER migration 33's rollback, not before: `apply_credit`,
-- `expire_credit_batches` and `batches_expiring_soon` all read the columns
-- dropped here, and `create_booking` calls the allocator.
--
-- DROPPING `expires_at` AND `batch_id` DOES NOT CHANGE ANY BALANCE, which is
-- the one reassuring property of the ratified substrate: balance is
-- SUM(delta_czk) and every row keeps its delta. What is lost is which credit
-- came from which batch — after this, a pass remainder is simply ordinary
-- unexpiring credit, and the player keeps it. That errs in the player's
-- favour, which is the right direction for a rollback of a money feature.

drop function if exists public.my_credit_batches();
drop function if exists public.credit_batches(uuid);

alter table public.credit_topups drop column if exists pass_games;
drop table if exists public.pass_tiers;

drop index if exists public.credit_ledger_expiry_idx;
drop index if exists public.credit_ledger_batch_idx;

alter table public.credit_ledger
  drop constraint if exists credit_ledger_batch_shape,
  drop constraint if exists credit_ledger_batch_positive;

alter table public.credit_ledger
  drop column if exists expiry_notified_at,
  drop column if exists batch_id,
  drop column if exists expires_at;

-- Narrow the catalog back. Any `credit_expired` row would violate the restored
-- CHECK, so those rows go first — a narrowing is NOT covered by the standing
-- widening sign-off, precisely because it can invalidate existing rows. If
-- this is ever run against a database that has swept a real expiry, the
-- deletion removes audit history and is a decision to make deliberately.
delete from public.events where event_type = 'credit_expired';

alter table public.events drop constraint events_event_type_catalog;

alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    'account_created', 'auth_link_sent', 'auth_completed', 'player_claimed',
    'game_published', 'game_cancelled', 'game_settled',
    'booking_created', 'admin_booking_created', 'booking_cancelled',
    'booking_expired', 'spot_released',
    'payment_confirmed', 'payment_unmatched', 'credit_issued', 'credit_redeemed',
    'topup_requested', 'topup_confirmed',
    'waitlist_joined', 'waitlist_notified', 'waitlist_converted',
    'nudge_sent', 'reminder_sent', 'attendance_marked',
    'admin_granted', 'admin_revoked',
    'profile_photo_removed', 'player_anonymized',
    'site_setting_changed'
  )
);
