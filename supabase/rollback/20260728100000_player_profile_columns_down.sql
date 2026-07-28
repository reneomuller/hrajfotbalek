-- Rollback for 20260728100000_player_profile_columns.sql

alter table public.players
  drop constraint if exists players_tos_paired,
  drop constraint if exists players_photo_path_shape,
  drop constraint if exists players_country_iso3166;

alter table public.players
  drop column if exists photo_path,
  drop column if exists tos_version,
  drop column if exists tos_accepted_at,
  drop column if exists skill_level,
  drop column if exists country;

-- After the column is gone, nothing references the type. Dropping it here keeps
-- the rollback total: a re-apply of the migration recreates it, and a left-over
-- type would make that `create type` fail.
drop type if exists public.skill_level;
