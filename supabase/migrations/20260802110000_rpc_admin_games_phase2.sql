-- =============================================================================
-- Migration 28 — admin_create_game_v2 / admin_update_game_v2
--
-- Phase 2 §5, §5.2, §5.3, §5.3a. The v1 pair from migration 16 knows nothing
-- about the organizer, the duration, the skill restriction or the substitutes,
-- and Postgres cannot `create or replace` into a different parameter list.
--
-- SO THESE ARE NEW FUNCTIONS, not replacements — the same shape as
-- `complete_signup_v2` in migration 23, and for the same reason. The v1 pair
-- stays in place, orphaned from the UI. Removing it is a destructive migration
-- and therefore a gated item, not something this migration decides.
--
-- OVERLOADING WAS THE OTHER OPTION AND IT IS A TRAP. Adding the new columns as
-- DEFAULTed parameters to `admin_create_game` would create a second function of
-- the same name, and a 7-argument call would then match both — Postgres raises
-- `function is not unique` rather than picking one. PostgREST calls by name, so
-- the failure would land at runtime on the admin form, not here.
--
-- THE ORGANIZER IS WRITTEN IN THE SAME TRANSACTION AS THE GAME. It goes through
-- `set_game_organizer` (migration 27) rather than a second INSERT here, so the
-- upsert rule and the "empty phone is NULL, not an empty string" rule live in
-- exactly one place. A game created by this function always has an organizer
-- row: §5 makes the name required, and a required field that can be skipped by
-- a failed second call is not required.
--
-- CAPACITY IS STILL NOT EDITABLE IN THE UPDATE PATH. `set_game_capacity` owns
-- the "never below the active bookings" rule and the fullness resync; that has
-- not changed and this migration does not duplicate it.
--
-- Rollback: supabase/rollback/20260802110000_rpc_admin_games_phase2_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_game_organizer — widened to admin OR service role
--
-- FOUND WHILE BUILDING THIS MIGRATION, and it is a real defect rather than a
-- test inconvenience. Migration 27 wrote this function's guard as
-- `is_admin_caller()` alone. Every other admin write in this codebase —
-- `admin_create_game`, `admin_update_game`, `set_game_capacity`, `cancel_game`,
-- `confirm_topup` — accepts `is_admin_caller() OR is_service_role()`, because
-- cron routes, the seed script and future bank pollers are legitimate
-- service-role callers.
--
-- The consequence was not theoretical: `admin_create_game_v2` calls this
-- function, so a service-role caller passed the outer check and was then
-- refused by the inner one, mid-transaction. The whole create failed with a
-- message naming a function the caller never invoked.
--
-- Nothing about who may READ the phone changes. `game_organizer_contacts`
-- still grants nothing to `anon` or `authenticated`, and both exits are
-- unchanged. This is `create or replace` on an identical signature — no drop,
-- so it is inside the additive rule.
-- -----------------------------------------------------------------------------

create or replace function public.set_game_organizer(
  p_game_id uuid,
  p_organizer_name text,
  p_organizer_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;

  if p_organizer_name is null or btrim(p_organizer_name) = '' then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;

  -- Empty string is not a phone number; it is the absence of one, and storing
  -- it would make "has a phone" true for a game with nothing to call.
  v_phone := nullif(btrim(coalesce(p_organizer_phone, '')), '');

  insert into public.game_organizer_contacts (game_id, organizer_name, organizer_phone)
  values (p_game_id, btrim(p_organizer_name), v_phone)
  on conflict (game_id) do update
    set organizer_name = excluded.organizer_name,
        organizer_phone = excluded.organizer_phone,
        updated_at = now();
end $$;

-- -----------------------------------------------------------------------------
-- Shared validation for the three descriptive columns.
--
-- The CHECK constraints from migration 26 are the enforcement; these raise the
-- NAMED errors the admin form renders instead of a raw constraint violation.
-- The mapping is one-to-one with `games_duration_range` and `games_subs_range`.
-- -----------------------------------------------------------------------------

create function public.assert_game_shape(
  p_duration_minutes    integer,
  p_subs_per_team       integer
)
returns void
language plpgsql
-- DELIBERATELY VOLATILE (the default), not IMMUTABLE. This function exists to
-- raise, and its result is discarded by `perform`. Marking it non-volatile
-- invites the planner to fold or prune the call — the trap CLAUDE.md records
-- from the `count(*)` probe, where a non-volatile call was optimised out and
-- the check it performed never ran.
set search_path = ''
as $$
begin
  -- 30–180 per the v1.1.1 ruling. NULL is "not stated", which is a real answer
  -- and renders as the policy fallback.
  if p_duration_minutes is not null
     and (p_duration_minutes < 30 or p_duration_minutes > 180) then
    raise exception 'INVALID_DURATION'
      using detail = 'duration_minutes must be between 30 and 180';
  end if;

  if p_subs_per_team is not null
     and (p_subs_per_team < 0 or p_subs_per_team > 20) then
    raise exception 'INVALID_SUBS'
      using detail = 'subs_per_team must be between 0 and 20';
  end if;
end;
$$;

revoke execute on function public.assert_game_shape(integer, integer) from public, anon;
grant execute on function public.assert_game_shape(integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- normalize_skill_levels — one way to say "all levels"
--
-- NULL means all levels and NO badge anywhere (§5.3, and the comment on
-- `games.allowed_skill_levels`). An array holding all three levels means the
-- same thing while rendering three badges that say nothing, and an empty array
-- means "restricted to nothing", which has no reading at all.
--
-- Both collapse to NULL here so the whole test for "no badge" stays
-- `allowed_skill_levels is null` at every render site, rather than each site
-- growing its own opinion about what a full array means.
-- -----------------------------------------------------------------------------

create function public.normalize_skill_levels(p_levels public.skill_level[])
returns public.skill_level[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_distinct public.skill_level[];
begin
  if p_levels is null or cardinality(p_levels) = 0 then
    return null;
  end if;

  -- Deduplicated and ordered, so two admins who ticked the same two boxes in a
  -- different order produce the same stored value and the badges render in a
  -- stable order.
  select array_agg(level order by level)
    into v_distinct
    from (select distinct unnest(p_levels) as level) s;

  if cardinality(v_distinct) >= 3 then
    return null;
  end if;

  return v_distinct;
end;
$$;

revoke execute on function public.normalize_skill_levels(public.skill_level[]) from public, anon;
grant execute on function public.normalize_skill_levels(public.skill_level[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- admin_create_game_v2 — always a draft, always with an organizer
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- admin_update_game_v2 — everything except status and capacity
-- -----------------------------------------------------------------------------

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

-- =============================================================================
-- Grants. REVOKE FIRST — Postgres grants EXECUTE to PUBLIC on a new function by
-- default, so who may call this is decided by what is revoked (the Phase 12
-- finding, applied here from the start rather than discovered again).
-- =============================================================================

revoke execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) from public, anon;

revoke execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) from public, anon;

grant execute on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) to authenticated, service_role;

grant execute on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) to authenticated, service_role;

comment on function public.admin_create_game_v2(
  uuid, timestamptz, integer, integer, text, text, text, text, text, integer,
  public.skill_level[], integer
) is
  'Admin-only. Creates a game as draft with its organizer contact in the same '
  'transaction. Format is stored verbatim and never derived from capacity.';

comment on function public.admin_update_game_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  integer, public.skill_level[], integer
) is
  'Admin-only. Edits everything except status and capacity, and upserts the '
  'organizer contact. Capacity belongs to set_game_capacity.';
