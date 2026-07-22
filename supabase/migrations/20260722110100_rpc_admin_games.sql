-- =============================================================================
-- Migration 16 — admin_create_venue, admin_create_game, admin_update_game
--
-- WHY GAME CREATION IS AN RPC AND NOT AN INSERT. `games` is a state-bearing
-- table: the row is born carrying a `status`, and the invariant this codebase
-- rests on is that no state-bearing write happens from TypeScript. The seed
-- script's direct inserts are the one sanctioned exception, and they run
-- against a dev fixture set, not an admin session. Making creation an RPC also
-- puts the authorization in the same place as every other admin write —
-- `is_admin_caller() or is_service_role()`, checked inside the function.
--
-- NOTHING HERE WRITES `status`. Creation always produces a `draft`; every
-- subsequent transition belongs to the Phase 7 functions (`publish_game`,
-- `mark_game_played`, `settle_game`, `cancel_game`). `admin_update_game`
-- likewise refuses to touch it. Two code paths that can both move a game's
-- status is how a state machine stops being one.
--
-- CAPACITY IS NOT EDITABLE HERE either — `set_game_capacity` already owns that
-- edit, including the refusal to drop capacity below the active-booking count
-- and the `sync_game_fullness` call that follows it. Duplicating the rule here
-- would mean maintaining it twice.
--
-- PRICE EDITS APPLY FORWARD ONLY, and that is a property of the schema rather
-- than a rule enforced here: `bookings.price_czk` is written at booking time,
-- so a game repriced today cannot change what an existing booking owes. This
-- function updates `games.price_czk` and touches no booking.
--
-- Rollback: supabase/rollback/20260722110100_rpc_admin_games_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_create_venue
-- -----------------------------------------------------------------------------

create function public.admin_create_venue(
  p_name       text,
  p_image_path text default null,
  p_map_query  text default null
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

  insert into public.venues (name, image_path, map_query)
  values (btrim(p_name), nullif(btrim(coalesce(p_image_path, '')), ''),
                          nullif(btrim(coalesce(p_map_query, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_create_game — always a draft
-- -----------------------------------------------------------------------------

create function public.admin_create_game(
  p_venue_id  uuid,
  p_starts_at timestamptz,
  p_capacity  integer,
  p_price_czk integer,
  p_format    text default null,
  p_surface   text default null,
  p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
  v_id    uuid;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_create_game requires an admin session or service role';
  end if;

  select * into v_venue from public.venues v where v.id = p_venue_id;
  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  if p_starts_at is null then
    raise exception 'INVALID_STARTS_AT';
  end if;
  if p_capacity is null or p_capacity < 1 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if p_price_czk is null or p_price_czk < 0 then
    raise exception 'INVALID_PRICE';
  end if;

  -- `status` is left to the column default. Stated as a comment rather than
  -- written explicitly so there is exactly one place that decides what a new
  -- game starts as: creation and publication are separate admin actions, and
  -- nothing auto-publishes.
  insert into public.games (
    venue, venue_id, starts_at, capacity, price_czk, format, surface, notes, city, brand
  )
  values (
    v_venue.name, v_venue.id, p_starts_at, p_capacity, p_price_czk,
    nullif(btrim(coalesce(p_format, '')), ''),
    nullif(btrim(coalesce(p_surface, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_venue.city, v_venue.brand
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_game — everything except status and capacity
-- -----------------------------------------------------------------------------

create function public.admin_update_game(
  p_game_id   uuid,
  p_venue_id  uuid,
  p_starts_at timestamptz,
  p_price_czk integer,
  p_format    text default null,
  p_surface   text default null,
  p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game  public.games%rowtype;
  v_venue public.venues%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_update_game requires an admin session or service role';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- A played, settled or cancelled game is history. Editing its time or price
  -- after the fact would rewrite what the roster and the ledger already agreed
  -- on, and no admin task requires it.
  if v_game.status not in ('draft', 'published', 'full') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  select * into v_venue from public.venues v where v.id = p_venue_id;
  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  if p_starts_at is null then
    raise exception 'INVALID_STARTS_AT';
  end if;
  if p_price_czk is null or p_price_czk < 0 then
    raise exception 'INVALID_PRICE';
  end if;

  update public.games
     set venue      = v_venue.name,
         venue_id   = v_venue.id,
         starts_at  = p_starts_at,
         price_czk  = p_price_czk,
         format     = nullif(btrim(coalesce(p_format, '')), ''),
         surface    = nullif(btrim(coalesce(p_surface, '')), ''),
         notes      = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_game_id;

  return p_game_id;
end;
$$;

revoke execute on function public.admin_create_venue(text, text, text) from public;
revoke execute on function public.admin_create_game(uuid, timestamptz, integer, integer, text, text, text) from public;
revoke execute on function public.admin_update_game(uuid, uuid, timestamptz, integer, text, text, text) from public;

revoke execute on function public.admin_create_venue(text, text, text) from anon;
revoke execute on function public.admin_create_game(uuid, timestamptz, integer, integer, text, text, text) from anon;
revoke execute on function public.admin_update_game(uuid, uuid, timestamptz, integer, text, text, text) from anon;

grant execute on function public.admin_create_venue(text, text, text) to authenticated, service_role;
grant execute on function public.admin_create_game(uuid, timestamptz, integer, integer, text, text, text) to authenticated, service_role;
grant execute on function public.admin_update_game(uuid, uuid, timestamptz, integer, text, text, text) to authenticated, service_role;

comment on function public.admin_create_game(uuid, timestamptz, integer, integer, text, text, text) is
  'Admin-only. Creates a game as draft — never published. Capacity edits belong '
  'to set_game_capacity and status transitions to the Phase 7 functions.';
comment on function public.admin_update_game(uuid, uuid, timestamptz, integer, text, text, text) is
  'Admin-only. Edits venue/time/price/format/surface/notes on a non-terminal '
  'game. Writes no status and no booking: a price change applies forward only.';
