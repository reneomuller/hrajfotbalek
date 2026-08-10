-- Rollback for 20260810120000_player_positions.sql
--
-- The grant is narrowed back to what migration 21 left client-writable, and
-- the column goes with its constraints. `array_is_distinct` is NOT dropped —
-- it belongs to the venue-amenities migration and is still in use by
-- `venues_amenities_distinct`.

revoke update (country, skill_level, positions) on public.players from authenticated;

alter table public.players drop constraint if exists players_positions_distinct;
alter table public.players drop constraint if exists players_positions_catalog;
alter table public.players drop column if exists positions;
