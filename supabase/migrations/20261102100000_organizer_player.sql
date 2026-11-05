-- =============================================================================
-- ROUND 42 — the organizer is a player, and the game page shows their photo.
--
-- The owner: "on every game card we have an organizer. it currently doesn't
-- show an image/profile pic. I'd like that to be visible." He chose to PICK
-- the organizer from the players rather than match the typed name, which would
-- be guessing about identity — and then, before this file ever reached
-- production: "in the player admin view ... 'make organizer' next to the
-- option of making the user admin. then, for each game we create, there should
-- simply be a dropdown of the users we gave organizer status to."
--
-- 0. `players.is_organizer` and `admin_set_organizer(player, flag)` — an
--    admin-only switch beside admin rights, logged the same way
--    (`organizer_granted` / `organizer_revoked`, so the event catalog widens
--    by two, READ from the live constraint). Taking it away keeps the games a
--    player already runs: history is not rewritten.
--
-- 1. `game_organizer_contacts.organizer_player_id` — which player runs the
--    game, or null. The name column stays — the card prints it, and the form
--    now fills it from the chosen player. `set_game_organizer`'s upsert never
--    names the column, so every game edit (which calls it) keeps the link.
--
-- 2. `set_game_organizer_player(game, player)` — admin only; null clears.
--    Only a live account that IS an organizer.
--
-- 3. `game_organizer_profile(game)` — the linked player's nickname and photo
--    path, to anyone who may see the game: the same statuses as
--    `game_organizer_public`, and nothing once the account is deleted.
--
-- 4. Backfill: a game whose typed organizer name is exactly one live
--    player's nickname (ignoring case) is linked to that player, and every
--    player so linked becomes an organizer — the people already running games
--    are the dropdown's first entries.
--
-- 5. `app_capabilities()` — every earlier flag probed (none copied as
--    `true`), `adminRemoveCreditChoice` included (round 42's other file may
--    land before or after this one), plus this file's `organizerPlayer`.
--
-- Additive, idempotent, NOT deploy-first, order-free against everything
-- applied. The deploy is safe without it: the game page asks for the profile
-- and shows initials when the function is missing, and the admin form keeps
-- its typed name — and the player page has no Make organizer — until
-- `app_capabilities()` says `organizerPlayer`.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261102100000_organizer_player.sql --production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Organizer status
-- -----------------------------------------------------------------------------

alter table public.players
  add column if not exists is_organizer boolean not null default false;

comment on column public.players.is_organizer is
  'Offered in the admin game form''s organizer dropdown (round 42). Set by '
  'admin_set_organizer; taking it away keeps the games a player already runs.';

do $$
declare
  v_def   text;
  v_types text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.events'::regclass
     and c.conname = 'events_event_type_catalog';

  if v_def is null then
    raise exception 'organizer: events_event_type_catalog is missing';
  end if;

  -- BOTH SPELLINGS, as round 39 and round 40 read them: `ARRAY['a'::text…]`
  -- and `'{a,b}'::text[]`. A parser that reads one sees the other as empty.
  select array_agg(distinct parsed.x) into v_types
    from (
      select m[1] as x
        from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m
      union
      select btrim(y)
        from regexp_matches(v_def, '\{([^}]*)\}', 'g') as b,
             unnest(string_to_array(b[1], ',')) as y
    ) parsed
   where parsed.x ~ '^[a-z_]+$';

  -- A FLOOR, so a parse that went wrong stops here instead of dropping types.
  if coalesce(array_length(v_types, 1), 0) < 30
     or not ('game_deleted' = any (v_types) and 'admin_granted' = any (v_types)) then
    raise exception 'organizer: could not read the event catalog (% types parsed)',
      coalesce(array_length(v_types, 1), 0);
  end if;

  if 'organizer_granted' = any (v_types) and 'organizer_revoked' = any (v_types) then
    raise notice 'organizer: the event catalog already carries both types';
    return;
  end if;

  v_types := array(select distinct unnest(v_types || array['organizer_granted', 'organizer_revoked']));

  alter table public.events drop constraint events_event_type_catalog;
  execute format(
    'alter table public.events add constraint events_event_type_catalog '
    'check (event_type in (%s))',
    (select string_agg(quote_literal(t.x), ', ' order by t.x) from unnest(v_types) as t(x))
  );
end $$;

create or replace function public.admin_set_organizer(
  p_player_id uuid,
  p_is_organizer boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.players%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_is_organizer is null then
    raise exception 'INVALID_ORGANIZER_FLAG';
  end if;

  select * into v_target from public.players pl where pl.id = p_player_id;
  -- Granting needs a live account; taking it away works on any row that has it.
  if not found
     or (p_is_organizer and (v_target.auth_user_id is null or v_target.deleted_at is not null)) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if v_target.is_organizer = p_is_organizer then
    return p_is_organizer;
  end if;

  update public.players set is_organizer = p_is_organizer where id = p_player_id;

  insert into public.events (event_type, player_id, metadata)
  values (
    case when p_is_organizer then 'organizer_granted' else 'organizer_revoked' end,
    p_player_id,
    jsonb_build_object('by_player_id', public.current_player_id())
  );

  return p_is_organizer;
end $$;

revoke execute on function public.admin_set_organizer(uuid, boolean) from public, anon;
grant execute on function public.admin_set_organizer(uuid, boolean) to authenticated, service_role;

comment on function public.admin_set_organizer(uuid, boolean) is
  'Makes a player an organizer, or takes it away (round 42). Admin only; '
  'logged as organizer_granted / organizer_revoked.';

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

  -- And an organizer: the dropdown offers only them, and so does this.
  if p_player_id is not null and not exists (
    select 1 from public.players where id = p_player_id and is_organizer
  ) then
    raise exception 'PLAYER_NOT_ORGANIZER';
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
  'Links a game''s organizer to a player who is an organizer, or clears the '
  'link with null (round 42). Admin only.';

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

-- Everyone already running a game is an organizer.
update public.players
   set is_organizer = true
 where not is_organizer
   and id in (select organizer_player_id from public.game_organizer_contacts
               where organizer_player_id is not null);

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
    -- Round 42's other file, which may land before or after this one.
    'adminRemoveCreditChoice', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'admin_remove_booking'
        and p.parameter_name = 'p_return_credit')),
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
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'players'
                    and column_name = 'is_organizer') then
    raise exception 'organizer: players.is_organizer is missing';
  end if;
  if has_function_privilege('anon', 'public.admin_set_organizer(uuid, boolean)', 'execute') then
    raise exception 'organizer: anon can execute admin_set_organizer';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.events'::regclass
                    and c.conname = 'events_event_type_catalog'
                    and pg_get_constraintdef(c.oid) like '%organizer_granted%'
                    and pg_get_constraintdef(c.oid) like '%organizer_revoked%') then
    raise exception 'organizer: the event catalog lacks the two organizer types';
  end if;
  if exists (select 1 from public.game_organizer_contacts c
               join public.players p on p.id = c.organizer_player_id
              where not p.is_organizer) then
    raise exception 'organizer: the backfill linked a player who is not an organizer';
  end if;
  -- Not "every flag true": `adminRemoveCreditChoice` is round 42's other file
  -- and may honestly be false here. This file asserts what it created.
  if (select count(*) from jsonb_object_keys(v_caps)) <> 35
     or not (v_caps ->> 'organizerPlayer')::boolean then
    raise exception 'round 42: app_capabilities is not 35 flags with organizerPlayer: %', v_caps;
  end if;
end $$;
