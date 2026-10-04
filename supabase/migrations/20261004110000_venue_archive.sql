-- =============================================================================
-- ROUND 39, ITEM 2 — a venue is ARCHIVED, not deleted.
--
-- WHAT DELETE COULD NOT DO. `admin_delete_venue` refuses any venue a game
-- references, correctly — `games.venue_id` is ON DELETE RESTRICT and a game
-- whose venue vanished renders a blank where its name should be. So a ground
-- the organizer has stopped using could never leave the picker: every venue
-- worth retiring has games on it, which is why it was worth retiring.
--
-- ARCHIVE IS A TIMESTAMP ON THE ROW. `archived_at` set means "do not offer this
-- for new games"; the row stays, so every game that references it keeps its
-- name, photo, map link and amenities on cards, detail pages and history. The
-- player-facing reads are all BY ID and never filter on it. Only the admin
-- picker and the admin venue list read it.
--
-- HARD DELETE STAYS for a venue with zero games — `admin_delete_venue` is
-- untouched and still raises VENUE_HAS_GAMES otherwise.
--
-- ADDITIVE, IDEMPOTENT, NOT DEPLOY-FIRST, ORDER-FREE. The deployed app reads
-- venues with `select *` and treats a missing column as "not archived", and
-- renders the archive controls only when `app_capabilities()` says
-- `venueArchive`. Shape-only verification at the foot; the behaviour is drilled
-- in `supabase/tests/venue_archive.sql`.
-- =============================================================================

alter table public.venues
  add column if not exists archived_at timestamptz;

comment on column public.venues.archived_at is
  'Set when an admin archives the venue: it leaves the game picker and the '
  'active venue list. Games referencing it keep rendering it. Null = active.';

/*
 * THE GRANT IS SAID OUT LOUD. `venues` carries a table-level SELECT for anon
 * and authenticated today, which covers a new column — but the player pages
 * read `select *`, and a column-level grant regime would turn that into a
 * permission error on EVERY venue read, which renders as every card losing its
 * venue. One idempotent line removes the question.
 */
grant select on public.venues to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. The event catalog, widened by two — computed from what is LIVE.
--
-- Drop and re-add, pre-approved while the new list is a strict superset. The
-- list is READ from the constraint in place rather than restated by hand, so
-- it is a superset of whatever this database actually carries — the same
-- out-of-order trap `app_capabilities()` fell into cannot happen here.
-- -----------------------------------------------------------------------------

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
    raise exception 'venue archive: events_event_type_catalog is missing';
  end if;

  /*
   * BOTH SPELLINGS ARE READ. `pg_get_constraintdef` renders an `in (...)` list
   * as `ARRAY['a'::text, ...]` but an array-literal check as `'{a,b}'::text[]`,
   * and a parser that reads only one of them reads the other as EMPTY — which
   * rebuilds the catalog as two types. It did, on this file's own second local
   * run, and only the existing rows violating it stopped the commit.
   */
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
     or not ('game_deleted' = any (v_types) and 'venue_deleted' = any (v_types)) then
    raise exception 'venue archive: could not read the event catalog (% types parsed)',
      coalesce(array_length(v_types, 1), 0);
  end if;

  if 'venue_archived' = any (v_types) and 'venue_restored' = any (v_types) then
    raise notice 'venue archive: the event catalog already carries both types';
    return;
  end if;

  v_types := v_types || array['venue_archived', 'venue_restored'];

  -- Written as `in (...)`, the spelling every earlier migration used.
  alter table public.events drop constraint events_event_type_catalog;
  execute format(
    'alter table public.events add constraint events_event_type_catalog '
    'check (event_type in (%s))',
    (select string_agg(quote_literal(t.x), ', ' order by t.x) from unnest(v_types) as t(x))
  );
end $$;

-- -----------------------------------------------------------------------------
-- 2. Archive and restore
-- -----------------------------------------------------------------------------

create or replace function public.admin_archive_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into v_venue from public.venues v where v.id = p_venue_id for update;
  if not found then raise exception 'VENUE_NOT_FOUND'; end if;

  -- Archiving twice is a no-op, not an error: the stamp keeps the FIRST time.
  if v_venue.archived_at is not null then return; end if;

  update public.venues set archived_at = now() where id = p_venue_id;

  insert into public.events (event_type, metadata, city, brand)
  values ('venue_archived',
          jsonb_build_object('venue_id', p_venue_id, 'name', v_venue.name),
          v_venue.city, v_venue.brand);
end
$$;

revoke execute on function public.admin_archive_venue(uuid) from public;
grant execute on function public.admin_archive_venue(uuid) to authenticated, service_role;

create or replace function public.admin_restore_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into v_venue from public.venues v where v.id = p_venue_id for update;
  if not found then raise exception 'VENUE_NOT_FOUND'; end if;

  if v_venue.archived_at is null then return; end if;

  update public.venues set archived_at = null where id = p_venue_id;

  insert into public.events (event_type, metadata, city, brand)
  values ('venue_restored',
          jsonb_build_object('venue_id', p_venue_id, 'name', v_venue.name),
          v_venue.city, v_venue.brand);
end
$$;

revoke execute on function public.admin_restore_venue(uuid) from public;
grant execute on function public.admin_restore_venue(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. app_capabilities() — RESTATED IN FULL, a superset of what is LIVE.
--
-- Probed on production 2026-10-04: the live jsonb carries exactly the keys of
-- `20260917100000_duration_pricing`. Every key below that this file does not
-- create is a PROBE, `durationPricing` included now that it is not this file's.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
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

    -- Created by THIS file.
    'venueArchive',      true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. VERIFICATION — SHAPE ONLY. NO VENUE IS ARCHIVED, RESTORED OR CREATED.
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps jsonb;
  v_name text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'venues' and column_name = 'archived_at'
  ) then
    raise exception 'venue archive: venues.archived_at is missing';
  end if;

  if not has_column_privilege('anon', 'public.venues', 'archived_at', 'SELECT')
     or not has_column_privilege('authenticated', 'public.venues', 'archived_at', 'SELECT') then
    raise exception 'venue archive: anon/authenticated cannot read venues.archived_at — every select * on venues would fail';
  end if;

  foreach v_name in array array['admin_archive_venue', 'admin_restore_venue', 'admin_delete_venue'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    ) then
      raise exception 'venue archive: % is missing', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.events'::regclass
       and c.conname = 'events_event_type_catalog'
       and pg_get_constraintdef(c.oid) like '%venue_archived%'
       and pg_get_constraintdef(c.oid) like '%venue_restored%'
       and pg_get_constraintdef(c.oid) like '%venue_deleted%'
       and pg_get_constraintdef(c.oid) like '%game_deleted%'
  ) then
    raise exception 'venue archive: the event catalog does not carry the archive types';
  end if;

  v_caps := public.app_capabilities();
  if (v_caps ->> 'venueArchive') is distinct from 'true' then
    raise exception 'venue archive: app_capabilities does not report venueArchive';
  end if;
  if (v_caps ->> 'durationPricing') is distinct from 'true' then
    raise exception 'venue archive: durationPricing dropped — the probe is wrong';
  end if;

  raise notice 'venue archive: shape verified — drilled in supabase/tests/venue_archive.sql';
end $$;
