-- Rollback for 20260823100000_players_updated_at.
--
-- Dropping the column is safe for the application: it reads
-- `updated_at ?? created_at`, so it falls back to the pre-migration behaviour
-- rather than erroring. What comes back with it is the bug — a replaced photo
-- keeps its URL and browsers keep the old bytes.
drop trigger if exists players_touch_updated_at on public.players;
drop function if exists public.touch_players_updated_at();
alter table public.players drop column if exists updated_at;
