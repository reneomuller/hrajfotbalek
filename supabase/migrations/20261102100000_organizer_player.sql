-- =============================================================================
-- ROUND 42 — the organizer is a player, and the game page shows their photo.
--
-- The owner: "on every game card we have an organizer. it currently doesn't
-- show an image/profile pic. I'd like that to be visible." He chose to PICK
-- the organizer from the players in the admin form, rather than match the
-- typed name against nicknames, which would be guessing about identity.
--
-- 1. `game_organizer_contacts.organizer_player_id` — which player runs the
--    game, or null. The typed name stays: it is what the card prints, and an
--    organizer who is not a player keeps working exactly as before.
--    `set_game_organizer`'s upsert never names the column, so every game edit
--    (which calls it) keeps the link.
--
-- 2. `set_game_organizer_player(game, player)` — admin only; null clears.
--    Only a live account: a deleted one or a guest row has no profile.
--
-- 3. `game_organizer_profile(game)` — the linked player's nickname and photo
--    path, to anyone who may see the game: the same statuses as
--    `game_organizer_public`, and nothing once the account is deleted.
--
-- 4. Backfill: a game whose typed organizer name is exactly one live
--    player's nickname (ignoring case) is linked to that player.
--
-- 5. `app_capabilities()` — the 33 flags, each probed for what it needs (none
--    copied from the last file as `true`), plus this file's `organizerPlayer`.
--
-- Additive, idempotent, NOT deploy-first, order-free against everything
-- applied. The deploy is safe without it: the game page asks for the profile
-- and shows initials when the function is missing, and the admin form offers
-- the player picker only once `app_capabilities()` says `organizerPlayer`.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261102100000_organizer_player.sql --production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The link
-- -----------------------------------------------------------------------------

alter table public.game_organizer_contacts
  add column if not exists organizer_player_id uuid
    references public.players (id) on delete set null;

comment on column public.game_organizer_contacts.organizer_player_id is
  'The player who runs this game, picked by an admin (round 42); null for an '
  'organizer who is only a typed name. The game page shows their photo.';

-- -----------------------------------------------------------------------------
-- 2. The admin writer
-- -----------------------------------------------------------------------------

create or replace function public.set_game_organizer_player(
  p_game_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- A live account only: a guest row and a deleted account have no profile,
  -- so there would be no face to show and no page to link to.
  if p_player_id is not null and not exists (
    select 1 from public.players
     where id = p_player_id and auth_user_id is not null and deleted_at is null
  ) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Every game is created with its organizer row (`admin_create_game_v2`
  -- writes it in the same transaction), so a missing row is a game nobody
  -- has named an organizer for yet.
  update public.game_organizer_contacts
     set organizer_player_id = p_player_id,
         updated_at          = now()
   where game_id = p_game_id;

  if not found then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;
end $$;

revoke execute on function public.set_game_organizer_player(uuid, uuid) from public, anon;
grant execute on function public.set_game_organizer_player(uuid, uuid)
  to authenticated, service_role;

comment on function public.set_game_organizer_player(uuid, uuid) is
  'Links a game''s organizer to a player, or clears the link with null '
  '(round 42). Admin only.';

-- -----------------------------------------------------------------------------
-- 3. The public read
-- -----------------------------------------------------------------------------

create or replace function public.game_organizer_profile(p_game_id uuid)
returns table (nickname text, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nickname, p.photo_path
  from public.game_organizer_contacts c
  join public.games g on g.id = c.game_id
  join public.players p on p.id = c.organizer_player_id
  where c.game_id = p_game_id
    and g.status in ('published', 'full', 'played', 'settled')
    and p.auth_user_id is not null
    and p.deleted_at is null;
$$;

revoke execute on function public.game_organizer_profile(uuid) from public;
grant execute on function public.game_organizer_profile(uuid)
  to anon, authenticated, service_role;

comment on function public.game_organizer_profile(uuid) is
  'The organizer''s nickname and photo for a game anyone may see (round 42) '
  '— the same statuses as game_organizer_public. Nothing for a draft or '
  'cancelled game, for an organizer who is only a typed name, or once the '
  'player''s account is deleted.';

-- -----------------------------------------------------------------------------
-- 4. Backfill — exact nickname, exactly one live player
-- -----------------------------------------------------------------------------

update public.game_organizer_contacts c
   set organizer_player_id = m.player_id
  from (
    select c2.game_id, min(p.id::text)::uuid as player_id
      from public.game_organizer_contacts c2
      join public.players p
        on lower(p.nickname) = lower(btrim(c2.organizer_name))
       and p.auth_user_id is not null
       and p.deleted_at is null
     where c2.organizer_player_id is null
     group by c2.game_id
    having count(*) = 1
  ) m
 where c.game_id = m.game_id;

-- -----------------------------------------------------------------------------
-- 5. app_capabilities() — the 33 live flags, each probed for what it needs,
--    plus this file's one.
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
    -- Created by THIS file.
    'organizerPlayer',        true
  )
$$;

-- -----------------------------------------------------------------------------
-- 6. VERIFICATION — SHAPE ONLY, and the result of the backfill above.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'game_organizer_contacts'
                    and column_name = 'organizer_player_id') then
    raise exception 'organizer player: game_organizer_contacts.organizer_player_id is missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'set_game_organizer_player') then
    raise exception 'organizer player: set_game_organizer_player is missing';
  end if;
  if has_function_privilege('anon', 'public.set_game_organizer_player(uuid, uuid)', 'execute') then
    raise exception 'organizer player: anon can execute set_game_organizer_player';
  end if;
  if not has_function_privilege('anon', 'public.game_organizer_profile(uuid)', 'execute') then
    raise exception 'organizer player: anon cannot read game_organizer_profile';
  end if;
  -- The backfill: no game whose typed name is exactly one live player's
  -- nickname is left unlinked.
  if exists (
    select 1 from public.game_organizer_contacts c
     where c.organizer_player_id is null
       and (select count(*) from public.players p
             where lower(p.nickname) = lower(btrim(c.organizer_name))
               and p.auth_user_id is not null and p.deleted_at is null) = 1
  ) then
    raise exception 'organizer player: the backfill left a matching game unlinked';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 34
     or exists (select 1 from jsonb_each(v_caps) where value <> 'true'::jsonb) then
    raise exception 'round 42: app_capabilities is not 34 flags, all true: %', v_caps;
  end if;
end $$;
