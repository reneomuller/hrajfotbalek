-- =============================================================================
-- Migration 35 — a format may be a three-way split
--
-- Pickup football in Prague is not always two teams. Eighteen players on one
-- pitch is routinely run as 6v6v6, rotating: the losing side comes off. The
-- format column has always been the organizer's own words for the shape of the
-- game, but the CHECK only ever admitted two numbers:
--
--     format ~ '^[0-9]{1,2}v[0-9]{1,2}$'
--
-- so "6v6v6" was rejected at the database — and, because `lib/admin/gameForm.ts`
-- mirrors this regex, rejected in the form before it ever got there. An
-- organizer running a three-way had no way to say so and left the field blank,
-- which is why so many games render no format chip at all.
--
-- THE SHAPE IS WIDENED, NOT OPENED. Two or three sides, one or two digits each.
-- Not "any text": this value is rendered as-is in a chip on a public page, and
-- the constraint is what makes that safe to do without escaping decisions at
-- the render site. Four-way is deliberately not admitted — nobody has asked for
-- it and an unbounded repeat is how this becomes a free-text field by degrees.
--
-- The app-side regex in `lib/admin/gameForm.ts` is updated in the same change.
-- They are two statements of one rule and drift is the only failure mode.
--
-- Rollback: supabase/rollback/20260802180000_format_three_way_down.sql
-- =============================================================================

alter table public.games drop constraint games_format_format;

alter table public.games add constraint games_format_format check (
  format is null or format ~ '^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2})?$'
);

comment on column public.games.format is
  'The organizer''s words for the shape of the game: 6v6, or 6v6v6 for a '
  'rotating three-way. Constrained rather than free text because it is '
  'rendered as-is in a chip on a public page. Mirrored by FORMAT_RE in '
  'lib/admin/gameForm.ts.';
