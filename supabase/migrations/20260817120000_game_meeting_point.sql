-- =============================================================================
-- games.meeting_point — "where exactly do you meet"
--
-- SCOPE AMENDMENT, 2026-08-17, by the owner's ruling (Section 4, item 7). The
-- third schema exception granted in this front-end round, after
-- `players.positions` and `venues.pitch_name`.
--
-- ON `games`, NOT ON `venues`, and that is the decision worth recording. A
-- pitch has one entrance; a GAME can meet anywhere — by the changing rooms
-- this week and at the far goal next, because another booking has the near
-- half. It is a property of the fixture, which is why it is editable in the
-- game form rather than in the venue record.
--
-- NULLABLE, NO DEFAULT. Every existing game keeps rendering exactly as it does
-- now: §7's line is hidden when the field is empty, so nothing is blocked on an
-- organizer who has not written one. A default would put the same guess on
-- every fixture ever created.
--
-- FREE TEXT, BOUNDED. It is a sentence a human writes for other humans — "by
-- the blue container behind the north goal" — and no closed set would survive
-- contact with a second venue. Bounded at 200 so it stays one line on a phone;
-- rendered as a JSX child, which React escapes.
--
-- Rollback: supabase/rollback/20260817120000_game_meeting_point_down.sql
-- =============================================================================

alter table public.games
  add column if not exists meeting_point text;

alter table public.games add constraint games_meeting_point_length check (
  meeting_point is null or length(btrim(meeting_point)) between 1 and 200
);

comment on column public.games.meeting_point is
  'Where the players actually gather, per GAME rather than per venue — a '
  'pitch has one entrance but a fixture can meet anywhere on it. Rendered in '
  '"Good to know" when set and the line is hidden when null. Written through '
  'the admin game form.';
