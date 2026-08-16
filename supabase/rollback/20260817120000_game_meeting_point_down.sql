-- Rollback for 20260817120000_game_meeting_point.sql

alter table public.games drop constraint if exists games_meeting_point_length;
alter table public.games drop column if exists meeting_point;
