-- Rollback for 20260720100000_players_games_events.sql
-- Drops in reverse dependency order: events -> games -> players -> enum.
-- Run against a database where migration 2 has already been rolled back.

drop table if exists public.events cascade;
drop table if exists public.games cascade;
drop table if exists public.players cascade;
drop type if exists public.game_status;
