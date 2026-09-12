-- =============================================================================
-- ROUND 31, ITEM 1 — the venue keeps the SOURCE as well as the coordinates.
--
-- WHAT WENT WRONG, AND IT IS A ROUND-30 CONSEQUENCE. Round 30 taught the venue
-- field to resolve a share link into coordinates, which put the pin in exactly
-- the right place — and then the player's directions button opened Google
-- labelled `50.092534,14.475315`. The pin was correct and the product looked
-- cheap. One column could hold the pin or the provenance, not both, and the
-- provenance was the half being thrown away.
--
-- `map_url` IS THE ORIGINAL SHARE LINK, kept verbatim, and it is what the
-- player's button opens when there is one: Google's own place card, with the
-- name, the photographs and the entrance. Nothing this product could assemble
-- beats the page Google already has for that exact place.
--
-- `map_query` KEEPS ITS JOB and loses one it should never have had. It is
-- coordinates, an address, or a place name — the thing searched for when there
-- is no share link. **It must never again hold a URL**, which it does today on
-- two production rows, and which is why this migration has a backfill.
--
-- THE BACKFILL IS THE MIGRATION'S PURPOSE, not a probe, so its RESULT is
-- verified below. It is the only write here. See CLAUDE.md, "A migration's
-- verification block may not write a row" — the drill for the behaviour lives
-- in `supabase/tests/venue_map_url.sql`.
-- =============================================================================

alter table public.venues
  add column if not exists map_url text;

comment on column public.venues.map_url is
  'The Google Maps share link an admin pasted, verbatim. The player button '
  'opens this when set. map_query holds coordinates or a search string and '
  'must never hold a URL.';

-- -----------------------------------------------------------------------------
-- THE BACKFILL — existing venues gain the improvement without being re-entered
--
-- Every row whose `map_query` is a URL becomes a row whose `map_url` is that
-- URL and whose `map_query` is empty. After it:
--
--   * the player's button opens the share link — Google's named place card
--   * the address line prints nothing rather than printing a URL
--   * `venues_map_query_not_a_url` above can be satisfied at all
--
-- THE BACKFILL RUNS BEFORE THE CONSTRAINT, and the order is not cosmetic:
-- Postgres VALIDATES a CHECK at ADD time against every existing row, so adding
-- it first would abort the migration on the very rows it exists to clean up.
-- Clean, then forbid.
-- -----------------------------------------------------------------------------
update public.venues
   set map_url   = coalesce(map_url, btrim(map_query)),
       map_query = null
 where map_query ~* '^\s*https?://';

/*
 * A URL IS REFUSED IN `map_query` FROM NOW ON, as a constraint rather than a
 * convention. Two rows got there by being typed in before round 30 had a
 * resolver, and the address line printed them to players as though they were
 * streets. A check is the only thing that stops the third one.
 *
 * THE NULL ARM IS EXPLICIT, because a CHECK that evaluates to NULL PASSES —
 * relying on that is how a constraint quietly stops constraining.
 */
alter table public.venues drop constraint if exists venues_map_query_not_a_url;
alter table public.venues add constraint venues_map_query_not_a_url
  check (map_query is null or map_query !~* '^\s*https?://');

-- -----------------------------------------------------------------------------
-- The capability flag
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
    'adminRemoveCover',       true,
    'venueMapUrl',            true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — SHAPE, plus the RESULT of this migration's own backfill
--
-- No fixture, no probe, no writing RPC.
-- -----------------------------------------------------------------------------
do $$
declare v_urls integer;
begin
  if coalesce((public.app_capabilities() ->> 'venueMapUrl')::boolean, false) is not true then
    raise exception 'venue map url: the capability flag did not turn on';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'venues'
                    and column_name = 'map_url' and data_type = 'text') then
    raise exception 'venue map url: the column is missing';
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'venues_map_query_not_a_url') then
    raise exception 'venue map url: the no-URL constraint is missing';
  end if;

  -- THE BACKFILL LEFT NOTHING BEHIND.
  select count(*) into v_urls from public.venues where map_query ~* '^\s*https?://';
  if v_urls > 0 then
    raise exception 'venue map url: % venues still hold a URL in map_query', v_urls;
  end if;

  raise notice 'venue map url: shape verified — behaviour is drilled in supabase/tests/venue_map_url.sql';
end $$;

-- -----------------------------------------------------------------------------
-- The two writers learn the second field
--
-- RESTATED IN FULL, and their defaults restated with them: Postgres refuses a
-- `create or replace` that drops a parameter default, and every existing
-- caller relies on them.
--
-- `p_map_url` IS TRAILING AND DEFAULTS TO NULL, so nothing that calls these
-- today has to change to keep working — the seed, the fixtures and the SQL
-- suites all pass fewer arguments.
--
-- THE OLD SIGNATURES ARE DROPPED FIRST, AND THAT IS NOT TIDINESS. `create or
-- replace` with an extra parameter does not replace anything — it creates an
-- OVERLOAD. Both would then exist, and a three-argument call becomes
-- `function admin_create_venue(unknown, unknown, unknown) is not unique`,
-- because the new one's trailing default makes it an equally good candidate.
-- Every existing caller — the seed, the fixtures, PostgREST — would start
-- failing on an ambiguity nothing in the diff mentions. Caught by the drill.
-- -----------------------------------------------------------------------------
drop function if exists public.admin_create_venue(text, text, text);
drop function if exists public.admin_update_venue(uuid, text, text, text);

create or replace function public.admin_create_venue(
  p_name       text,
  p_image_path text default null,
  p_map_query  text default null,
  p_map_url    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_create_venue requires an admin session or service role';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'INVALID_VENUE_NAME';
  end if;

  -- Reported rather than silently returning the existing row: the admin may
  -- have been trying to attach a different image, and quietly ignoring that
  -- would look like it worked. The form steers them to pick the existing venue.
  if exists (select 1 from public.venues v where lower(v.name) = lower(btrim(p_name))) then
    raise exception 'VENUE_EXISTS'
      using detail = 'a venue with that name already exists';
  end if;

  insert into public.venues (name, image_path, map_query, map_url)
  values (btrim(p_name),
          nullif(btrim(coalesce(p_image_path, '')), ''),
          nullif(btrim(coalesce(p_map_query, '')), ''),
          nullif(btrim(coalesce(p_map_url, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_create_venue(text, text, text, text) from public;
grant execute on function public.admin_create_venue(text, text, text, text)
  to authenticated, service_role;

create or replace function public.admin_update_venue(
  p_venue_id   uuid,
  p_name       text,
  p_map_query  text default null,
  p_pitch_name text default null,
  p_map_url    text default null
)
returns public.venues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.venues;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_update_venue requires an admin session or service role';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'VENUE_NAME_REQUIRED';
  end if;

  if char_length(btrim(p_name)) > 80 then
    raise exception 'VENUE_NAME_TOO_LONG';
  end if;

  /*
   * EMPTY COLLAPSES TO NULL for the optional fields, so clearing a field in
   * the form clears the column rather than storing an empty string that every
   * reader then has to treat as absent.
   */
  update public.venues
     set name       = btrim(p_name),
         map_query  = nullif(btrim(coalesce(p_map_query, '')), ''),
         pitch_name = nullif(btrim(coalesce(p_pitch_name, '')), ''),
         map_url    = nullif(btrim(coalesce(p_map_url, '')), '')
   where id = p_venue_id
   returning * into v_row;

  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.admin_update_venue(uuid, text, text, text, text) from public;
grant execute on function public.admin_update_venue(uuid, text, text, text, text)
  to authenticated, service_role;
