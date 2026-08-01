-- Rollback for 20260802130000_site_settings.sql
--
-- Drops the function and the table. The admin-editable numbers go with it,
-- which is correct for a rollback of this table: they are two values a human
-- typed and can type again, and leaving a table nothing reads would leave a
-- public-facing claim about community size with no surface accounting for it.
--
-- THE CATALOG IS NARROWED BACK, and that is the part to read carefully. Any
-- `site_setting_changed` row written while this migration was applied would
-- violate the restored CHECK, so those rows are deleted first — a narrowing is
-- NOT covered by the standing widening sign-off (contract §1) precisely
-- because it can invalidate existing rows.
--
-- If this rollback is ever run against a database that has been live with the
-- feature, the deletion below removes audit history. That is a decision to
-- make deliberately at the time, not a step to run past.

drop function if exists public.set_site_setting(text, jsonb);
drop table if exists public.site_settings;

delete from public.events where event_type = 'site_setting_changed';

alter table public.events drop constraint events_event_type_catalog;

alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    'account_created',
    'auth_link_sent',
    'auth_completed',
    'player_claimed',
    'game_published',
    'game_cancelled',
    'game_settled',
    'booking_created',
    'admin_booking_created',
    'booking_cancelled',
    'booking_expired',
    'spot_released',
    'payment_confirmed',
    'payment_unmatched',
    'credit_issued',
    'credit_redeemed',
    'topup_requested',
    'topup_confirmed',
    'waitlist_joined',
    'waitlist_notified',
    'waitlist_converted',
    'nudge_sent',
    'reminder_sent',
    'attendance_marked',
    'admin_granted',
    'admin_revoked',
    'profile_photo_removed',
    'player_anonymized'
  )
);
