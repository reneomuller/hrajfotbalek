-- =============================================================================
-- Migration 21 — player profile columns (country, skill, TOS, photo)
--
-- Phase 2 §3.1 and §4. Every column is NULLABLE, without exception: this
-- database is live, four real players exist, and a NOT NULL column with a
-- default would silently assert something untrue about all four of them —
-- that they are Czech, or a beginner, or that they accepted terms nobody has
-- shown them. Absent is the honest value until each person supplies their own.
--
-- WHAT WRITES THESE. Nothing client-side. `complete_signup_v2` (migration 22)
-- writes country, skill and the TOS stamp at signup; the photo path is written
-- by the storage flow in Phase 7 and cleared by `remove_profile_photo`. The
-- existing per-column UPDATE grant on `players` covers exactly nickname, phone
-- and marketing_opt_in, and it is deliberately NOT extended here — see the
-- grants section.
--
-- SKILL IS AN ENUM, NOT FREE TEXT. There are three levels, they are rendered as
-- badges, and they are compared against `games.allowed_skill_levels` in
-- Phase 2 §5.3. A text column would let a typo become a level nobody can filter
-- on. The type is created here rather than in the games migration because the
-- player column is the first to need it.
--
-- TOS VERSION IS STORED, NOT ASSUMED. `tos_accepted_at` alone answers "did
-- they agree"; it cannot answer "to what". When the terms change — and they
-- will, since `content/terms.md` ships as a placeholder — the version string is
-- the only thing that distinguishes a player who accepted the current document
-- from one who accepted a draft two revisions ago.
--
-- Rollback: supabase/rollback/20260728100000_player_profile_columns_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- skill_level
-- -----------------------------------------------------------------------------

create type public.skill_level as enum ('beginner', 'intermediate', 'advanced');

comment on type public.skill_level is
  'Self-declared player ability. Display and social signalling only in Phase 2 '
  '— booking is never refused on skill (contract §5.3).';

-- -----------------------------------------------------------------------------
-- players
-- -----------------------------------------------------------------------------

alter table public.players
  add column country text,
  add column skill_level public.skill_level,
  add column tos_accepted_at timestamptz,
  add column tos_version text,
  add column photo_path text;

-- ISO 3166-1 alpha-2, upper case. Constrained at the column because the value
-- reaches a flag lookup and a filter, and a three-letter code or a lower-case
-- one would fail both silently — rendering no flag rather than an error.
alter table public.players
  add constraint players_country_iso3166 check (
    country is null or country ~ '^[A-Z]{2}$'
  );

-- The object key written by the storage flow: `players/<uuid>.<ext>`, and
-- nothing else. Same reasoning as `venues.image_path` in migration 15 — this is
-- interpolated into an image URL, so an off-site URL or a `javascript:` scheme
-- must be impossible to store, not merely impossible to render. Constrain the
-- value where it is stored.
alter table public.players
  add constraint players_photo_path_shape check (
    photo_path is null
    or photo_path ~ '^players/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

-- A TOS stamp is meaningless without the version it refers to, and a version
-- without a timestamp cannot be audited. Neither is optional once the other
-- exists.
alter table public.players
  add constraint players_tos_paired check (
    (tos_accepted_at is null) = (tos_version is null)
  );

-- =============================================================================
-- Grants
--
-- SELECT is table-wide on `players` for `authenticated` and reaches these
-- columns automatically; RLS still restricts the rows to the caller's own.
--
-- UPDATE is granted per column on this table (nickname, phone,
-- marketing_opt_in) precisely because an RLS policy cannot restrict WHICH
-- columns a role may write. None of the new columns joins that list: country
-- and skill are written by `complete_signup_v2`, the TOS pair is evidence about
-- consent and must not be self-editable, and the photo path is written by the
-- storage flow. A player editing their own `tos_accepted_at` is not a feature.
--
-- `anon` gets nothing here, as before: `players` has no anonymous read at all.
-- =============================================================================

comment on column public.players.country is
  'ISO 3166-1 alpha-2, upper case. Nullable: the players who predate Phase 2 '
  'never supplied one and must not be assumed into a nationality.';
comment on column public.players.skill_level is
  'Self-declared. Display only — see the type comment.';
comment on column public.players.tos_accepted_at is
  'When this player accepted the terms. Paired with tos_version by CHECK.';
comment on column public.players.tos_version is
  'Which revision of content/terms.md was accepted.';
comment on column public.players.photo_path is
  'Storage object key under the profile-photos bucket, or null for the initials '
  'avatar. Shape-constrained because it is interpolated into an image URL.';
