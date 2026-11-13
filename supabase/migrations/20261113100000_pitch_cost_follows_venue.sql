-- =============================================================================
-- ROUND 42 — A GAME'S PITCH COST FOLLOWS ITS VENUE UNTIL IT IS PLAYED.
--
-- The owner, 2026-11-13: "the pitch cost shows correctly in the venue where
-- you can write its value but gets written wrong in other places, for example
-- the admin finances section, where it keeps showing the placeholder value of
-- 1200 per pitch".
--
-- WHY. `20261108100000_pitch_costs.sql` stored each game's cost when the game
-- was made and never again ("each game keeps the cost it was created with").
-- Every game that already existed took the 1200 default when that migration
-- ran, before any real venue price had been typed — and typing one changed
-- only games made afterwards. So every game played so far still says 1200.
--
-- 1. `reprice_unplayed_games(venue)` — internal: every game that has not
--    FINISHED (kick-off + its length, the site's played rule) and whose cost
--    was not typed by hand takes its venue's current price for the season.
-- 2. `set_venue_pitch_costs` reprices that venue's unplayed games;
--    `set_pitch_season` reprices every venue's. A finished game keeps what it
--    cost, and a hand-typed cost always wins.
-- 3. ONE-TIME CORRECTION: every game whose cost was not typed by hand —
--    played ones included, because 1200 was never a real price — takes its
--    venue's current price for the current season.
--
-- No capability flag: the controls already exist and behave the same; only
-- what they reprice changes. Idempotent (the correction converges), NOT
-- deploy-first, order-free after `20261108100000`.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261113100000_pitch_cost_follows_venue.sql --production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reprice the games that have not finished.
-- -----------------------------------------------------------------------------

create or replace function public.reprice_unplayed_games(p_venue_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.game_pitch_costs c
     set cost_czk   = public.venue_pitch_cost_now(g.venue_id),
         updated_at = now()
    from public.games g
   where c.game_id = g.id
     and not c.set_by_hand
     and g.venue_id is not null
     and (p_venue_id is null or g.venue_id = p_venue_id)
     and g.status not in ('played', 'settled', 'cancelled')
     -- Not finished: the null-row fallback is the 60 minutes every other
     -- surface uses (`policy.game.durationMinutes`, `advance_played_games`).
     and g.starts_at + make_interval(mins => coalesce(g.duration_minutes, 60)) > now()
     and public.venue_pitch_cost_now(g.venue_id) is not null
     and c.cost_czk is distinct from public.venue_pitch_cost_now(g.venue_id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.reprice_unplayed_games(uuid) from public, anon, authenticated;

comment on function public.reprice_unplayed_games(uuid) is
  'Internal (2026-11-13). Unfinished games whose pitch cost was not typed by hand take '
  'their venue''s current price for the season; one venue, or all with null.';

-- -----------------------------------------------------------------------------
-- 2. The two writers reprice as they write.
-- -----------------------------------------------------------------------------

create or replace function public.set_venue_pitch_costs(
  p_venue_id uuid, p_summer_czk integer, p_winter_czk integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_summer_czk is null or p_winter_czk is null
     or p_summer_czk not between 0 and public.pitch_cost_max_czk()
     or p_winter_czk not between 0 and public.pitch_cost_max_czk() then
    raise exception 'PITCH_COST_OUT_OF_RANGE'
      using detail = 'between 0 and ' || public.pitch_cost_max_czk()::text || ' CZK';
  end if;

  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.venue_pitch_costs (venue_id, summer_czk, winter_czk, updated_at)
  values (p_venue_id, p_summer_czk, p_winter_czk, now())
  on conflict (venue_id) do update
     set summer_czk = excluded.summer_czk,
         winter_czk = excluded.winter_czk,
         updated_at = now();

  -- 2026-11-13: the venue's games that have not finished follow.
  perform public.reprice_unplayed_games(p_venue_id);

  return jsonb_build_object('summer_czk', p_summer_czk, 'winter_czk', p_winter_czk);
end $$;

comment on function public.set_venue_pitch_costs(uuid, integer, integer) is
  'Admin-only. Sets a venue''s summer and winter pitch cost (round 42) and reprices its '
  'games that have not finished, except a cost typed by hand (2026-11-13).';

create or replace function public.set_pitch_season(p_season text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_season is null or p_season not in ('summer', 'winter') then
    raise exception 'INVALID_PITCH_SEASON' using detail = 'summer or winter';
  end if;

  insert into public.pitch_settings (id, season, updated_at, updated_by)
  values ('singleton', p_season, now(), public.current_player_id())
  on conflict (id) do update
     set season = excluded.season,
         updated_at = now(),
         updated_by = excluded.updated_by;

  -- 2026-11-13: every venue's games that have not finished follow.
  perform public.reprice_unplayed_games(null);

  return p_season;
end $$;

comment on function public.set_pitch_season(text) is
  'Admin-only. Switches every venue to its summer or winter pitch cost (round 42), for new '
  'games and for games that have not finished, except a cost typed by hand (2026-11-13).';

-- -----------------------------------------------------------------------------
-- 3. One-time correction: the placeholder 1200 out of every game's cost.
-- -----------------------------------------------------------------------------

update public.game_pitch_costs c
   set cost_czk   = public.venue_pitch_cost_now(g.venue_id),
       updated_at = now()
  from public.games g
 where c.game_id = g.id
   and not c.set_by_hand
   and g.venue_id is not null
   and public.venue_pitch_cost_now(g.venue_id) is not null
   and c.cost_czk is distinct from public.venue_pitch_cost_now(g.venue_id);

-- -----------------------------------------------------------------------------
-- VERIFICATION — SHAPE ONLY, and the result of this file's own correction.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.reprice_unplayed_games(uuid)') is null then
    raise exception 'pitch cost follows venue: reprice_unplayed_games is missing';
  end if;
  if has_function_privilege('anon', 'public.reprice_unplayed_games(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.reprice_unplayed_games(uuid)', 'execute') then
    raise exception 'pitch cost follows venue: reprice_unplayed_games is callable from the API';
  end if;
  if position('reprice_unplayed_games' in pg_get_functiondef(
       'public.set_venue_pitch_costs(uuid, integer, integer)'::regprocedure)) = 0
     or position('reprice_unplayed_games' in pg_get_functiondef(
       'public.set_pitch_season(text)'::regprocedure)) = 0 then
    raise exception 'pitch cost follows venue: a writer does not reprice';
  end if;
  if exists (
    select 1 from public.game_pitch_costs c join public.games g on g.id = c.game_id
     where not c.set_by_hand and g.venue_id is not null
       and public.venue_pitch_cost_now(g.venue_id) is not null
       and c.cost_czk <> public.venue_pitch_cost_now(g.venue_id)) then
    raise exception 'pitch cost follows venue: a game not set by hand still differs from its venue';
  end if;
end $$;
