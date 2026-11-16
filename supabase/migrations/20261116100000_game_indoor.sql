-- =============================================================================
-- ROUND 42 — INDOOR OR OUTDOOR (2026-11-16).
--
-- The owner: "we currently have no selection of indoor or outdoor, so let's
-- also please add that in the same area we choose the surface" — shown on the
-- game card as a small pill under the languages.
--
-- 1. `games.indoor` — true indoor, false outdoor, null not yet said. Readable
--    by anyone, like the surface (the table-wide SELECT covers it).
-- 2. `set_game_indoor(game, indoor)` — admin only; null clears. Its own call,
--    like `set_game_language`, so neither game writer is restated.
-- 3. `app_capabilities()` — the 37 flags live on 2026-11-16, every one probed
--    (`pitchCosts` too, now that it is not this file's), plus `gameIndoor`.
--
-- Additive, idempotent, NOT deploy-first, order-free. The deploy is safe
-- without it: the game form offers the choice and the card draws the pill
-- only once `app_capabilities()` says `gameIndoor`.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261116100000_game_indoor.sql --production
-- =============================================================================

alter table public.games add column if not exists indoor boolean;

comment on column public.games.indoor is
  'Indoor (true) or outdoor (false); null until an admin says (2026-11-16). '
  'Printed on the game card under the languages.';

create or replace function public.set_game_indoor(p_game_id uuid, p_indoor boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.games g where g.id = p_game_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;

  update public.games set indoor = p_indoor where id = p_game_id;
  return p_indoor;
end $$;

revoke execute on function public.set_game_indoor(uuid, boolean) from public, anon;
grant execute on function public.set_game_indoor(uuid, boolean) to authenticated, service_role;

comment on function public.set_game_indoor(uuid, boolean) is
  'Admin-only. Says whether a game is indoor (true) or outdoor (false); null clears (2026-11-16).';

-- -----------------------------------------------------------------------------
-- app_capabilities() — every earlier flag probed, plus this file's one.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',          true,
    'dismissNotifications',   true,
    'adminRemoveBooking',     true,
    'adminDelete',            true,
    'cancelWithReason',       true,
    'gameLanguage',           true,
    'organizerTelegram',      true,
    'playersMet',             true,
    'playedSweep',            true,
    'playerNotifications',    true,
    'pendingSeatAnonymous',   true,
    'payFirstCheckout',       true,
    'addGuestsAfterBooking',  true,
    'publicProfileScope',     true,
    'creditLedgerNote',       true,
    'autoSettle',             true,
    'adminRemoveCover',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'remove_profile_cover')),
    'venueMapUrl',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'map_url')),
    'playerNumbers',     to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'player_number')),
    'adminRenamePlayer', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_set_display_name')),
    'partyUpToThirteen', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'max_party_guests')),
    'cancelGuests',      to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')),
    'creditsAreSeats',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_seat_price_czk')),
    'seatsTakenMany',    to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'game_seats_taken_many')),
    'banProfile',        to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ban_player')),
    'addGuestsConfirmation', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
        and p.parameter_name = 'guest_count')),
    'durationPricing',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'price_for_duration')),
    'venueArchive',      to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'archived_at')),
    'creditsSixtyDays',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_validity_days')),
    'consentRecords',    to_jsonb(exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'consent_records')),
    'deleteAccount',     to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_player_account')),
    'gameNumbers',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'games'
         and column_name = 'game_number')),
    'dismissOneNotification', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dismiss_notification')),
    'organizerPlayer',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_game_organizer_player')),
    'adminRemoveCreditChoice', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'admin_remove_booking'
        and p.parameter_name = 'p_return_credit')),
    'venueAddress',      to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'address')),
    'pitchCosts',        to_jsonb(exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'game_pitch_costs')),
    -- Created by THIS file.
    'gameIndoor',              true
  )
$$;

-- -----------------------------------------------------------------------------
-- VERIFICATION — SHAPE ONLY.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'games'
                    and column_name = 'indoor') then
    raise exception 'game indoor: games.indoor is missing';
  end if;
  if not has_column_privilege('anon', 'public.games', 'indoor', 'select') then
    raise exception 'game indoor: anon cannot read games.indoor';
  end if;
  if has_function_privilege('anon', 'public.set_game_indoor(uuid, boolean)', 'execute') then
    raise exception 'game indoor: anon can execute set_game_indoor';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 38
     or not (v_caps ->> 'gameIndoor')::boolean then
    raise exception 'round 42: app_capabilities is not 38 flags with gameIndoor: %', v_caps;
  end if;
end $$;
