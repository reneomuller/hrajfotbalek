-- =============================================================================
-- Migration 26 — the per-game descriptive columns
--
-- Phase 2 §5.2 / §5.3 / §5.3a. Three nullable columns on `games`, all of them
-- descriptive and none of them a constraint on booking.
--
-- CAPACITY REMAINS THE SOLE BOOKING LIMIT, and that is the load-bearing
-- sentence. `create_booking` counts active bookings against `games.capacity`
-- and consults none of these three. A future session reading "6v6" and "2 subs
-- per team" beside a capacity of 12 may be tempted to derive one from the
-- other; §5.3a forbids it in both directions, because a 12-capacity game may be
-- 5v5 with substitutes and inferring the format would print a confident
-- falsehood on a public page.
--
-- ALL NULLABLE, no defaults. The two games already in production predate every
-- one of these fields, and a default would assert a format and a duration
-- nobody chose. Null means "not stated", which renders as nothing.
--
-- Rollback: supabase/rollback/20260802100000_game_details_phase2_down.sql
-- =============================================================================

alter table public.games
  add column duration_minutes integer,
  add column allowed_skill_levels public.skill_level[],
  add column subs_per_team integer;

-- 30 to 180, per the v1.1.1 ruling. The admin form defaults to 60 and the
-- fallback constant is 60; a game outside this range is a typo, not a fixture.
alter table public.games
  add constraint games_duration_range check (
    duration_minutes is null or duration_minutes between 30 and 180
  );

-- 0 is meaningful ("no substitutes"), which is why the floor is 0 rather than
-- 1. The ceiling is a sanity bound: twenty substitutes per team is a data-entry
-- accident, not a Sunday league.
alter table public.games
  add constraint games_subs_range check (
    subs_per_team is null or subs_per_team between 0 and 20
  );

-- An empty array would render as "restricted to nothing", which is a state the
-- UI has no sensible reading of. All-levels is expressed as NULL — one way to
-- say a thing, so `allowed_skill_levels is null` is the whole test for "no
-- badge anywhere".
alter table public.games
  add constraint games_skill_levels_non_empty check (
    allowed_skill_levels is null or cardinality(allowed_skill_levels) > 0
  );

comment on column public.games.duration_minutes is
  'Nullable. Display only — nothing transitions on it. Null falls back to '
  'policy.game.durationMinutes (60).';
comment on column public.games.allowed_skill_levels is
  'Nullable enum array. NULL = all levels and NO badge. Display and social '
  'signalling only: booking is never refused on skill (contract §5.3).';
comment on column public.games.subs_per_team is
  'Nullable. Renders beside the format ("6v6 · 2 subs per team"). Constrains '
  'nothing — capacity is the sole booking limit.';
