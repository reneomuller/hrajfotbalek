-- Rollback for 20260826200000_organizer_telegram_handle.
--
-- DROP THE CAPABILITY FLAG FIRST if running by hand: it is what hides the
-- Telegram field and sends UA/RU games back to the WhatsApp button before the
-- column disappears under them.
--
-- `set_game_organizer` goes back to three arguments, which is what
-- `admin_create_game_v2` calls. Restoring it from 20260802110000 rather than
-- retyping it here — a third hand-kept copy of one function is how the round
-- 13 defect happened.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

drop function if exists public.game_organizer_telegram(uuid);
drop function if exists public.set_game_organizer(uuid, text, text, text);
alter table public.game_organizer_contacts drop constraint if exists organizer_telegram_format;
alter table public.game_organizer_contacts drop column if exists organizer_telegram;
