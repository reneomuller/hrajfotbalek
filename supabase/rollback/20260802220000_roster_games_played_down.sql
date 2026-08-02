-- Rollback for migration 39 — back to four columns.
--
-- Restated in full rather than "dropping a column": `create or replace view`
-- cannot drop one, so the view is replaced with its migration-29 body. The
-- index is left in place — it is useful to `bookings` reads generally and
-- dropping it is a performance decision, not part of undoing this projection.

create or replace view public.game_roster_public
with (security_invoker = false) as
  select
    b.game_id,
    p.nickname,
    b.status,
    p.photo_path
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

revoke all on public.game_roster_public from anon, authenticated;
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface. Projects game_id, nickname, booking status and '
  'photo_path — and NOTHING else.';
