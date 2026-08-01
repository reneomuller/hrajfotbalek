-- Rollback for 20260802100000_game_details_phase2.sql

alter table public.games
  drop constraint if exists games_skill_levels_non_empty,
  drop constraint if exists games_subs_range,
  drop constraint if exists games_duration_range;

alter table public.games
  drop column if exists subs_per_team,
  drop column if exists allowed_skill_levels,
  drop column if exists duration_minutes;
