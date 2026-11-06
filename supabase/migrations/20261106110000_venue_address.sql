-- =============================================================================
-- ROUND 42 — a venue's address, for the game's 9:16 story image.
--
-- The owner wants the story to carry the address "in format 'Dubecska 9,
-- Praha 7'". Venues held nothing like it: `map_query` is empty or a pair of
-- coordinates on production (checked 2026-11-06). So an admin types it once
-- per venue, on the venue page.
--
-- 1. `venues.address` — nullable, 1–120 characters. Readable by anyone, like
--    the venue's name (the table-wide SELECT grant covers it).
-- 2. `set_venue_address(venue, address)` — admin only; trims, and an empty
--    box clears it. Its own call, like `set_venue_amenities`, so neither of
--    the venue writers is restated.
-- 3. `app_capabilities()` — every earlier flag probed, plus `venueAddress`.
--
-- Additive, idempotent, NOT deploy-first, order-free. The deploy is safe
-- without it: the venue page offers the field only once `app_capabilities()`
-- says `venueAddress`, and the story image leaves the line out.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261106110000_venue_address.sql --production
-- =============================================================================

alter table public.venues add column if not exists address text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.venues'::regclass and conname = 'venues_address_length') then
    alter table public.venues
      add constraint venues_address_length
      check (address is null or length(btrim(address)) between 1 and 120);
  end if;
end $$;

comment on column public.venues.address is
  'The venue''s street address as people say it — "Dubečská 9, Praha 10" '
  '(round 42). Printed under the venue name on the game''s story image.';

create or replace function public.set_venue_address(p_venue_id uuid, p_address text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  if length(v_address) > 120 then
    raise exception 'ADDRESS_TOO_LONG';
  end if;

  update public.venues set address = v_address where id = p_venue_id;
  return v_address;
end $$;

revoke execute on function public.set_venue_address(uuid, text) from public, anon;
grant execute on function public.set_venue_address(uuid, text) to authenticated, service_role;

comment on function public.set_venue_address(uuid, text) is
  'Admin-only. Sets the venue''s address line (round 42); an empty one clears it.';

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
    -- Round 42's other file, which may land before or after this one.
    'organizerPlayer',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_game_organizer_player')),
    'adminRemoveCreditChoice', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'admin_remove_booking'
        and p.parameter_name = 'p_return_credit')),
    -- Created by THIS file.
    'venueAddress',            true
  )
$$;

-- -----------------------------------------------------------------------------
-- VERIFICATION — SHAPE ONLY.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'venues'
                    and column_name = 'address') then
    raise exception 'venue address: venues.address is missing';
  end if;
  if not has_column_privilege('anon', 'public.venues', 'address', 'select') then
    raise exception 'venue address: anon cannot read venues.address';
  end if;
  if has_function_privilege('anon', 'public.set_venue_address(uuid, text)', 'execute') then
    raise exception 'venue address: anon can execute set_venue_address';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 36
     or not (v_caps ->> 'venueAddress')::boolean then
    raise exception 'round 42: app_capabilities is not 36 flags with venueAddress: %', v_caps;
  end if;
end $$;
