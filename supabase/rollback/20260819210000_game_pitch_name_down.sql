-- =============================================================================
-- Rollback for migration 41 — removes games.pitch_name and the suggestions view
--
-- RESTORES THE TWELVE-ARGUMENT SIGNATURES VERBATIM from migration 30, which is
-- the version that was live before this one. The thirteen-argument functions
-- are dropped by their full signature first; leaving them would give PostgREST
-- two candidates and it calls by name, so every game create would fail with
-- "function is not unique" — the trap migration 33 documents.
--
-- WHAT THIS DESTROYS: every per-game pitch name typed while the column
-- existed. They are not recoverable from anywhere else — the venue default is
-- a different value with a different meaning. Stated here because a rollback
-- that looks total and quietly drops data is worse than one that says so.
-- =============================================================================

drop function if exists public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
);
drop function if exists public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
);

drop view if exists public.pitch_name_suggestions;

alter table public.games drop constraint if exists games_pitch_name_length;
alter table public.games drop column if exists pitch_name;

create function public.admin_create_game_v2(
  p_venue_id             uuid,
  p_starts_at            timestamptz,
  p_capacity             integer,
  p_price_czk            integer,
  p_organizer_name       text,
  p_format               text default null,
  p_surface              text default null,
  p_notes                text default null,
  p_organizer_phone      text default null,
  p_duration_minutes     integer default null,
  p_allowed_skill_levels public.skill_level[] default null,
  p_subs_per_team        integer default null
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
      using detail = 'admin_create_game_v2 requires an admin session or service role';
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
  if p_organizer_name is null or btrim(p_organizer_name) = '' then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;

  perform public.assert_game_shape(p_duration_minutes, p_subs_per_team);

  -- `status` is left to the column default: creation and publication stay two
  -- separate admin actions and nothing here auto-publishes.
  --
  -- `venue` — the legacy NOT NULL text column — is still populated from the
  -- venue's name (F3 / REQ-GAME-015). It is denormalised and it is not going
  -- away in Phase 2.
  --
  -- FORMAT IS STORED VERBATIM (§5.3a). Nothing here reads `p_capacity` to
  -- decide it, in either direction. A 12-capacity game whose organizer typed
  -- "5v5" is a 5v5 game with substitutes, and printing "6v6" from the number
  -- would be a confident falsehood on a public page.
  insert into public.games (
    venue, venue_id, starts_at, capacity, price_czk,
    format, surface, notes, city, brand,
    duration_minutes, allowed_skill_levels, subs_per_team
  )
  values (
    v_venue.name, v_venue.id, p_starts_at, p_capacity, p_price_czk,
    nullif(btrim(coalesce(p_format, '')), ''),
    nullif(btrim(coalesce(p_surface, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_venue.city, v_venue.brand,
    p_duration_minutes,
    public.normalize_skill_levels(p_allowed_skill_levels),
    p_subs_per_team
  )
  returning id into v_id;

  perform public.set_game_organizer(v_id, p_organizer_name, p_organizer_phone);

  return v_id;
end;
$$;

create function public.admin_update_game_v2(
  p_game_id              uuid,
  p_venue_id             uuid,
  p_starts_at            timestamptz,
  p_price_czk            integer,
  p_organizer_name       text,
  p_format               text default null,
  p_surface              text default null,
  p_notes                text default null,
  p_organizer_phone      text default null,
  p_duration_minutes     integer default null,
  p_allowed_skill_levels public.skill_level[] default null,
  p_subs_per_team        integer default null
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
      using detail = 'admin_update_game_v2 requires an admin session or service role';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- A played, settled or cancelled game is history. Editing its time or price
  -- after the fact rewrites what the roster and the ledger already agreed on.
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
  if p_organizer_name is null or btrim(p_organizer_name) = '' then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;

  perform public.assert_game_shape(p_duration_minutes, p_subs_per_team);

  update public.games
     set venue                = v_venue.name,
         venue_id             = v_venue.id,
         starts_at            = p_starts_at,
         price_czk            = p_price_czk,
         format               = nullif(btrim(coalesce(p_format, '')), ''),
         surface              = nullif(btrim(coalesce(p_surface, '')), ''),
         notes                = nullif(btrim(coalesce(p_notes, '')), ''),
         duration_minutes     = p_duration_minutes,
         allowed_skill_levels = public.normalize_skill_levels(p_allowed_skill_levels),
         subs_per_team        = p_subs_per_team
   where id = p_game_id;

  perform public.set_game_organizer(p_game_id, p_organizer_name, p_organizer_phone);

  return p_game_id;
end;
$$;

revoke execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) from public;
grant execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) to authenticated, service_role;

revoke execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) from public;
grant execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) to authenticated, service_role;
