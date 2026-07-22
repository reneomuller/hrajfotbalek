-- Rollback for 20260722110000_venues_game_details.sql

drop index if exists public.games_venue_id_idx;

alter table public.games
  drop constraint if exists games_notes_length,
  drop constraint if exists games_surface_known,
  drop constraint if exists games_format_format;

alter table public.games
  drop column if exists notes,
  drop column if exists surface,
  drop column if exists format,
  drop column if exists venue_id;

drop table if exists public.venues;
