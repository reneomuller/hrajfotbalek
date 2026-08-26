-- Rollback for 20260826100000_game_language.
--
-- DROP THE CAPABILITY FLAG FIRST if running by hand: it is what the
-- application reads to decide whether the language control exists, so removing
-- it hides the control before the column disappears under it.
--
-- The format CHECK goes back to the THREE-way form rather than the two-way one
-- production is on today. Narrowing to two would reject rows already stored as
-- 6v6v6, and a constraint that existing data violates cannot be added at all.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

drop function if exists public.set_game_language(uuid, text);
alter table public.games drop constraint if exists games_language_catalog;
alter table public.games drop column if exists language;

alter table public.games drop constraint games_format_format;
alter table public.games add constraint games_format_format check (
  format is null or format ~ '^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2})?$'
);
