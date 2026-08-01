-- =============================================================================
-- Migration 29 — game_roster_public gains photo_path, and NOTHING else
--
-- Contract §4a, ratified in advance (v1.1.3). This is the single highest-risk
-- PII surface in the product: a `security_invoker = false` view that bypasses
-- the RLS on `bookings`, `players` and `games`, whose projection and whose
-- game-status filter are the SOLE enforcement points. There is no second line
-- of defence behind it.
--
-- ONE COLUMN CROSSES. `photo_path` and nothing else. No `player_id`, no email,
-- no phone — the assertions in `supabase/tests/04_game_roster_public.sql` and
-- `roster_photo_path.sql` re-prove that after the widening, because "we only
-- added one column" is a claim about intent and the test is a claim about the
-- view.
--
-- WHY IT IS SAFE TO PUBLISH. A profile photo that appears only on its owner's
-- account page is a setting, not an avatar; rosters showing the photo is the
-- product intent rather than an extension of it, and the privacy text already
-- discloses that the photo appears wherever the nickname does — so a player
-- uploads knowing. The bucket is public-read in any case (migration 24): the
-- object is already reachable by anyone holding the URL. What this changes is
-- who can DISCOVER the URL, and the answer is the same set of people who can
-- already see the nickname it belongs to.
--
-- WHY IT SHIPS WITH ITS RENDERING. §4a requires the widening and the rendering
-- that consumes it to land in the same change, so a reviewer sees the
-- justification and the use in one diff rather than a view quietly gaining a
-- column ahead of any caller. Phase 15 is that change.
--
-- `create or replace view` cannot ADD a column in the middle or change a
-- column's type — it can only append. `photo_path` is appended last, which is
-- the only shape Postgres will accept here and also the one that leaves the
-- existing three columns at their existing positions for any `select *`.
--
-- Rollback: supabase/rollback/20260802120000_roster_photo_path_down.sql
-- =============================================================================

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

-- `create or replace view` preserves privileges, so the migration-2 grants
-- still stand. Restated anyway: a view whose grants are inherited invisibly is
-- a view whose access nobody can read off the migration that last touched it,
-- and this is not the surface to leave implicit.
revoke all on public.game_roster_public from anon, authenticated;
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface. Projects game_id, nickname, booking status and '
  'photo_path — and NOTHING else. SECURITY DEFINER by design; the game-status '
  'filter in the view body is the sole enforcement point and must not be '
  'removed. photo_path was added in Phase 15 under contract §4a, ratified in '
  'advance, with the rendering that consumes it in the same change. Any '
  'further column is a new ruling, not a follow-on.';
