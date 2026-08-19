-- =============================================================================
-- Migration 41 — games.pitch_name, typed per game and reusable
--
-- WHY THIS NEEDS SCHEMA AT ALL, since the round asked for the existing model
-- to be used if it fitted. It does not, and the reason is a one-liner:
-- `pitch_name` lives on `venues`, so it is ONE name shared by every game at
-- that venue, past and future. Typing a pitch name while creating a game and
-- storing it there would rewrite the pitch of every other game at the same
-- venue, retroactively, including games already played and settled. The only
-- other no-schema option — minting a new `venues` row per pitch — collapses
-- the venue/pitch distinction the model deliberately draws (a venue is the
-- area, a pitch is the surface at it) and multiplies the venue picker by
-- however many pitches each ground has.
--
-- So the game gets its own name. `venues.pitch_name` STAYS and keeps its
-- meaning: the default pitch for that venue, used when a game names none.
-- Section 3's rendering (`venueDisplayName`) is unchanged; only its input
-- moves from "the venue's pitch name" to "this game's, falling back to the
-- venue's".
--
-- THE DROPDOWN NEEDS NO TABLE. "Saved pitch names" is a QUERY, not an entity:
-- the distinct non-null `pitch_name` values across `games` and `venues` ARE
-- the list of names this organizer has used before. A `saved_pitches` table
-- would be a second source of truth that could disagree with the games
-- referencing it, and it would need CRUD nobody asked for. The view below is
-- the whole feature.
--
-- ONE DESIGN QUESTION IS DELIBERATELY LEFT OPEN and is flagged to the owner
-- rather than guessed: whether "save this pitch" is a real FLAG (a name is
-- remembered only when the box is ticked) or whether every typed name is
-- remembered automatically. This migration implements the second — every name
-- typed becomes available next time — because it needs no extra column and no
-- extra concept. If the owner wants the explicit flag, that is a boolean on
-- this column's row and a second migration; the UI is not built either way
-- until this is applied.
--
-- DROP AND RECREATE, NOT A DEFAULTED PARAMETER. Adding `p_pitch_name text
-- default null` to the existing functions would create an OVERLOAD rather than
-- replace them, and PostgREST — which calls by name — would then fail every
-- existing call with "function is not unique". Migration 33 documents this
-- trap after hitting it with `create_topup`; it is the reason both functions
-- are dropped by their full old signature first.
--
-- Rollback: supabase/rollback/20260819210000_game_pitch_name_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The column
-- -----------------------------------------------------------------------------

alter table public.games
  add column if not exists pitch_name text;

-- The same bounds `venues.pitch_name` carries, restated rather than shared:
-- a CHECK cannot be inherited, and two columns holding the same kind of value
-- should refuse the same things.
alter table public.games drop constraint if exists games_pitch_name_length;
alter table public.games add constraint games_pitch_name_length check (
  pitch_name is null or length(btrim(pitch_name)) between 1 and 60
);

comment on column public.games.pitch_name is
  'The pitch this game is played on, typed per game. Null means "use the '
  'venue''s pitch_name", which is the default for that ground. Rendered as '
  '"<pitch> · <venue>" by lib/venues/displayName.ts.';

-- -----------------------------------------------------------------------------
-- The dropdown's source
--
-- A VIEW, not a table. Every name an organizer has typed, plus every venue
-- default, deduplicated and ordered. `security_invoker = false` so it can read
-- both tables regardless of the caller's RLS, and it exposes nothing that is
-- not already public: pitch names are printed on every game card.
-- -----------------------------------------------------------------------------

create or replace view public.pitch_name_suggestions
with (security_invoker = false) as
  select distinct btrim(pitch_name) as pitch_name
    from (
      select pitch_name from public.games  where pitch_name is not null
      union all
      select pitch_name from public.venues where pitch_name is not null
    ) all_names
   where btrim(pitch_name) <> ''
   order by 1;

revoke all on public.pitch_name_suggestions from anon, authenticated;
-- Admin surfaces only. The organizer picking a pitch is an admin session; a
-- player has no use for the list and it is not rendered anywhere player-facing.
grant select on public.pitch_name_suggestions to authenticated, service_role;

comment on view public.pitch_name_suggestions is
  'Distinct pitch names already in use, across games and venues, for the '
  'admin game form''s dropdown. A query rather than a saved_pitches table: a '
  'second source of truth could disagree with the games referencing it.';

-- -----------------------------------------------------------------------------
-- admin_create_game_v2 — same body, one more field
-- -----------------------------------------------------------------------------

drop function if exists public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
);

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
  p_subs_per_team        integer default null,
  p_pitch_name           text default null
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

  insert into public.games (
    venue, venue_id, starts_at, capacity, price_czk,
    format, surface, notes, city, brand,
    duration_minutes, allowed_skill_levels, subs_per_team, pitch_name
  )
  values (
    v_venue.name, v_venue.id, p_starts_at, p_capacity, p_price_czk,
    nullif(btrim(coalesce(p_format, '')), ''),
    nullif(btrim(coalesce(p_surface, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_venue.city, v_venue.brand,
    p_duration_minutes,
    public.normalize_skill_levels(p_allowed_skill_levels),
    p_subs_per_team,
    -- Trimmed to null, so an empty box means "inherit the venue's" rather than
    -- storing a blank that renders as a stray separator.
    nullif(btrim(coalesce(p_pitch_name, '')), '')
  )
  returning id into v_id;

  perform public.set_game_organizer(v_id, p_organizer_name, p_organizer_phone);

  return v_id;
end;
$$;

revoke execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
) from public;
grant execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- admin_update_game_v2 — same body, one more field
-- -----------------------------------------------------------------------------

drop function if exists public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
);

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
  p_subs_per_team        integer default null,
  p_pitch_name           text default null
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
         subs_per_team        = p_subs_per_team,
         pitch_name           = nullif(btrim(coalesce(p_pitch_name, '')), '')
   where id = p_game_id;

  perform public.set_game_organizer(p_game_id, p_organizer_name, p_organizer_phone);

  return p_game_id;
end;
$$;

revoke execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
) from public;
grant execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer, text
) to authenticated, service_role;
