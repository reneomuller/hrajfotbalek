-- Rollback for 20260816120000_venue_pitch_name.sql
--
-- The column and its CHECK. Nothing else was touched: no grant changed, no
-- RLS policy moved, and `games.venue` was never involved.

alter table public.venues drop constraint if exists venues_pitch_name_length;
alter table public.venues drop column if exists pitch_name;
