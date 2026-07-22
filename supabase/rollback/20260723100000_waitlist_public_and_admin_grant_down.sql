-- Rollback for 20260723100000_waitlist_public_and_admin_grant.sql
--
-- The event catalog is restored to its 22-type form. Any admin_granted /
-- admin_revoked rows already written would then violate it, so they are
-- removed first — the alternative is a constraint that cannot be re-added.
-- This is the one place in the codebase that deletes from `events`, and it
-- exists only so the rollback actually runs; forward migrations never do.

drop function if exists public.set_player_admin(uuid, boolean);

drop view if exists public.game_waitlist_public;

delete from public.events where event_type in ('admin_granted', 'admin_revoked');

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
    'waitlist_joined',
    'waitlist_notified',
    'waitlist_converted',
    'nudge_sent',
    'reminder_sent',
    'attendance_marked'
  )
);

notify pgrst, 'reload schema';
