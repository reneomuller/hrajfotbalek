-- Rollback for 20260802120000_roster_photo_path.sql
--
-- Restores the migration-2 projection: game_id, nickname, status.
--
-- `create or replace view` cannot DROP a column, so this is a drop and a
-- rebuild. That is destructive in the narrow sense that the view ceases to
-- exist for the duration of one transaction — but a view holds no rows, and
-- the grants are restated immediately after, so nothing is lost that is not
-- put straight back.
--
-- ANYTHING RENDERING THE ROSTER PHOTO MUST BE ROLLED BACK WITH THIS. A caller
-- selecting `photo_path` from the restored view gets an error, not a null.

drop view if exists public.game_roster_public;

create view public.game_roster_public
with (security_invoker = false) as
  select
    b.game_id,
    p.nickname,
    b.status
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

revoke all on public.game_roster_public from anon, authenticated;
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface. Projects only game_id, nickname and booking status. '
  'SECURITY DEFINER by design; the game-status filter in the view body is the '
  'sole enforcement point and must not be removed.';
