-- Rollback for 20260823120000_round16_actions.
--
-- DROPPING `app_capabilities` IS THE IMPORTANT LINE and should be FIRST if you
-- run these by hand: it is what the application reads to decide whether the
-- rest exists, so removing it hides every control this migration enabled
-- before those controls can 404.
--
-- `dismissed_at` is dropped last and takes with it the record of which
-- notifications a player cleared. That is data, not schema — everything
-- dismissed comes back into their bell.
--
-- The event catalog is NOT narrowed here. Rows written under the widened list
-- would violate a re-narrowed CHECK, and an audit trail that cannot be read
-- back is worse than a catalog with four unused values in it.
drop function if exists public.app_capabilities();
drop function if exists public.cancel_game_with_reason(uuid, text);
drop function if exists public.admin_delete_venue(uuid);
drop function if exists public.admin_delete_game(uuid);
drop function if exists public.admin_remove_booking(uuid);
drop function if exists public.dismiss_all_notifications();
drop function if exists public.leave_waitlist(uuid);
alter table public.user_notification_reads drop column if exists dismissed_at;
