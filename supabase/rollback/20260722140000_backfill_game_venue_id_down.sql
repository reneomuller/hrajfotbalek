-- Rollback for 20260722140000_backfill_game_venue_id.sql
--
-- The backfill itself is DATA, not structure. Unlinking every game from its
-- venue would be indistinguishable from unlinking the ones an admin linked
-- deliberately, so this reverts only the grant and the comment. To undo the
-- backfill, drop the column — that is migration 15's rollback.

revoke delete on public.venues from service_role;

notify pgrst, 'reload schema';

comment on column public.games.venue_id is
  'Structured link to venues. games.venue keeps the display name as written '
  'at the time, so renaming a venue never rewrites a past game.';
