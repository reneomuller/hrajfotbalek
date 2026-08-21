-- =============================================================================
-- DELETE DRAFT GAMES — round 14, item 1. HANDED OVER, NOT RUN.
--
-- The draft concept is gone from the product: creating a game publishes it,
-- the "Unfinished games" list is removed, and the Publish button with it. What
-- can remain in the database is rows made before that change, or rows whose
-- publish call failed.
--
-- NOTHING IN THE REPOSITORY DELETES THEM. A draft is somebody's half-finished
-- work; a migration that removed it would be this codebase deciding on the
-- owner's behalf that it was worthless.
--
-- =============================================================================
-- STATE WHEN THIS WAS WRITTEN (2026-08-21, both databases read directly)
-- =============================================================================
--
--   PRODUCTION : 0 draft games. There is nothing to delete.
--   LOCAL/SEED : 1 — `5eed0000-0000-0000-0000-00000000b001`,
--                "Praha 3 • Pražačka (draft)", 0 bookings. It is a SEED
--                FIXTURE, recreated by `npm run seed`, and deleting it by hand
--                just means the next seed puts it back.
--
-- So on the day this shipped the answer was "nothing to do". Run the audit
-- anyway — that was true then, and this file will be read later.
--
-- =============================================================================
-- 1. THE AUDIT. Run this first, always.
-- =============================================================================

select g.id,
       g.venue,
       g.starts_at,
       g.created_at,
       (select count(*) from public.bookings b where b.game_id = g.id) as bookings,
       (select count(*) from public.waitlist w where w.game_id = g.id) as waitlist
  from public.games g
 where g.status = 'draft'
 order by g.created_at;

-- A DRAFT WITH BOOKINGS IS NOT A DRAFT. It means somebody was booked onto a
-- game that never went public — which is a bug worth understanding rather than
-- deleting. If the `bookings` column is anything but 0, STOP and look at why.

-- =============================================================================
-- 2. THE ALTERNATIVE, and consider it first
-- =============================================================================
--
-- A draft that SHOULD have been a game can still be put on the board. The
-- button is gone from the UI; the RPC is not:
--
--   select public.publish_game('<uuid>');
--
-- It emits `game_published` and the game joins the list like any other. That is
-- the right answer for a row that failed to publish rather than one nobody
-- wanted.

-- =============================================================================
-- 3. THE DELETE. One id at a time, deliberately.
-- =============================================================================
--
-- NOT `where status = 'draft'` as a blanket statement, which is the shape that
-- deletes a row somebody added while you were reading the audit. Paste the ids
-- the audit printed.
--
-- `games` cascades to `bookings`, `waitlist` and `game_organizer_contacts`;
-- `events.game_id` is ON DELETE SET NULL, so the event log KEEPS its rows and
-- loses only the pointer. That is the intended behaviour — the log is
-- append-only and a deleted game must not take history with it.

-- delete from public.games where id = '00000000-0000-0000-0000-000000000000' and status = 'draft';

-- The `and status = 'draft'` is not redundant. It is what stops a mistyped id
-- from deleting a LIVE game with players and money attached.
