-- =============================================================================
-- Migration 39 — game_roster_public gains games_played, and NOTHING else
--
-- Contract §4a. This is the same widening `photo_path` went through in
-- migration 29, and it gets the same treatment: `game_roster_public` is a
-- `security_invoker = false` view over `bookings`, `players` and `games`, and
-- its projection is the SOLE enforcement point. There is no second line of
-- defence behind it.
--
-- ONE COLUMN CROSSES. `games_played` and nothing else. Still no `player_id`,
-- no email, no phone — and the assertions in
-- `supabase/tests/04_game_roster_public.sql` re-prove that after the widening,
-- because "we only added one column" is a claim about intent and the test is a
-- claim about the view.
--
-- WHY IT IS SAFE TO PUBLISH. It is a count of rows that are already public. A
-- reader can today open every game page, read every roster, and tally how often
-- a nickname appears; this publishes the number they would arrive at rather
-- than a new fact. It discloses nothing about WHICH games — only how many.
--
-- WHAT IT COUNTS, precisely: bookings in a state that means the player was
-- there or is committed, on games that have actually been played or settled.
-- Not upcoming ones. "12 games" beside a name has to mean twelve games of
-- football, not eleven and one they have signed up for on Thursday — a counter
-- that goes up when you book is a counter measuring intent.
--
-- WHY IT SHIPS WITH ITS RENDERING. §4a requires the widening and the rendering
-- that consumes it in the same change. The players list on the rebuilt game
-- detail is that rendering.
--
-- `create or replace view` can only APPEND a column, which is why this one goes
-- last and the existing four keep their positions.
--
-- Rollback: supabase/rollback/20260802220000_roster_games_played_down.sql
-- =============================================================================

create or replace view public.game_roster_public
with (security_invoker = false) as
  select
    b.game_id,
    p.nickname,
    b.status,
    p.photo_path,
    /*
     * A CORRELATED SUBQUERY rather than a join with a group-by. The view is
     * read one game at a time — always `where game_id = $1`, a dozen rows —
     * so this runs a dozen index lookups on `bookings (player_id)`. A grouped
     * join would aggregate every booking in the table on every roster read.
     */
    (
      select count(*)
        from public.bookings b2
        join public.games g2 on g2.id = b2.game_id
       where b2.player_id = p.id
         and b2.status in ('reserved', 'confirmed')
         and g2.status in ('played', 'settled')
    )::integer as games_played
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

-- `create or replace view` preserves privileges. Restated anyway: a view whose
-- grants are inherited invisibly is a view whose access nobody can read off the
-- migration that last touched it, and this is not the surface to leave
-- implicit.
revoke all on public.game_roster_public from anon, authenticated;
grant select on public.game_roster_public to anon, authenticated;

-- The count reads `bookings` filtered by player. Without this the subquery is a
-- sequential scan per roster row.
create index if not exists bookings_player_status_idx
  on public.bookings (player_id, status);

comment on view public.game_roster_public is
  'Anonymous roster surface. Projects game_id, nickname, booking status, '
  'photo_path and games_played — and NOTHING else. SECURITY DEFINER by design; '
  'the game-status filter in the view body is the sole enforcement point and '
  'must not be widened without re-reading contract §4a. games_played counts '
  'PLAYED and SETTLED games only: a counter that rises when you book is a '
  'counter measuring intent.';
