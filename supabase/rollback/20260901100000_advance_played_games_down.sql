-- Rollback for 20260901100000_advance_played_games.
--
-- DROP THE FLAG FIRST if running by hand: `playedSweep` is what tells the cron
-- route the function is there. With it off the route reports `available:false`
-- and does nothing, which is the same path it takes before the migration is
-- applied — the same code, not a special case.
--
-- GAMES ALREADY ADVANCED ARE NOT PUT BACK. `played` is a true statement about
-- a game that happened, and reversing it would un-count history for every
-- player who has it — which is the opposite of what row 165 was about. If a
-- specific game was advanced wrongly, `admin_update_game` is the surface for
-- that one row.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true,
    'organizerTelegram', true,
    'playersMet', (
      select count(*) > 0 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'players_met'
    )
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

drop function if exists public.advance_played_games(integer);
