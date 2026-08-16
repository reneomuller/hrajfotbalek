-- =============================================================================
-- venues.pitch_name — the pitch's own name, above the district and area
--
-- SCOPE AMENDMENT, 2026-08-16, by the owner's ruling (Section 3, item 4). The
-- v1.3 round is front-end and `SCOPE.md` §2 says a round that drags a schema
-- change behind it stops being one; this column is the second exception the
-- owner has granted, after `players.positions`.
--
-- WHY IT CANNOT BE PARSED INSTEAD. `venues.name` is one free-text string
-- holding "Praha 3 • Pražačka" — district and area, two parts. The requested
-- display is three: pitch, district, area. There is no third fragment to read,
-- and splitting on the bullet would be guessing which piece is which the first
-- time somebody types a venue differently. One seeded row is literally an XSS
-- test payload, which is the shape of what free text can hold.
--
-- NULLABLE, WITH NO DEFAULT AND NO BACKFILL. Every existing row keeps its
-- current display until a human writes a real pitch name; the render rule is
-- "prefix when set, today's format when null", so no row is ever blocked on a
-- missing name. The names are the owner's to supply — inventing "Sportovní
-- centrum Pražačka" would put a plausible fiction on a public page.
--
-- NOT ADDED TO `games`. `games.venue` is a deliberate SNAPSHOT — migration
-- 20260722110000 says so: "a venue later renamed must not silently rewrite the
-- name on a game that was already played". The pitch name is read live through
-- `games.venue_id`, so history stays frozen and the new field stays current.
--
-- Rollback: supabase/rollback/20260816120000_venue_pitch_name_down.sql
-- =============================================================================

alter table public.venues
  add column if not exists pitch_name text;

/*
 * Bounded like `venues.name` and the organizer fields beside it, and NOT
 * NULLABLE-BUT-EMPTY: a zero-length pitch name would render as a leading
 * separator with nothing before it, which is worse than no name at all. Null
 * is the way to say "not set".
 */
alter table public.venues add constraint venues_pitch_name_length check (
  pitch_name is null or length(btrim(pitch_name)) between 1 and 60
);

comment on column public.venues.pitch_name is
  'The pitch''s own name, rendered before venues.name on a game pill: '
  '"<pitch_name> · <name>". Null is normal and renders the name alone — no '
  'row is blocked on a missing pitch name. Owner-supplied; never generated.';
