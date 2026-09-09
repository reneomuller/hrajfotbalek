-- =============================================================================
-- ROUND 28, ITEM 4 — the public profile shows country, position and level.
--
-- THIS AMENDS THE ROUND-14 SCOPE RULING, and it is the owner's amendment
-- rather than a reinterpretation of it. Round 14 item 13 drew the public
-- profile deliberately narrow — nickname, photograph, cover, and the three
-- counting stats — on the reasoning that a roster tap should answer "who is
-- this player" and not publish a profile nobody consented to. That reasoning
-- is unchanged and still bounds this: what is added is three fields the player
-- ALREADY fills in about their football, and nothing about their identity or
-- contact. Email, phone and join date stay out, as before.
--
-- NOTHING NEW IS COLLECTED. `country`, `skill_level` and `positions` are
-- existing columns on `players`, already edited on the account page and
-- already asked for at finish-profile. This migration only widens what the
-- public composite projects.
--
-- UNSET IS NOT EMPTY-STRING AND IS NOT A DEFAULT. A player who has set no
-- country gets NULL and the page omits the row entirely — no "Not set", no
-- placeholder flag. `positions` is `not null default '{}'`, so an empty array
-- is the unset case there.
--
-- THE TYPE MUST BE DROPPED AND RECREATED. A composite cannot gain a column
-- while a function returns it, so the function goes first and comes back
-- restated in full — which is also why `players_met` is recomputed here
-- verbatim rather than referenced: this file now owns the whole definition.
-- =============================================================================

drop function if exists public.public_player_profile(text);
drop type if exists public.public_profile;

create type public.public_profile as (
  nickname     text,
  photo_path   text,
  cover_path   text,
  games_played integer,
  hours        numeric,
  venues       integer,
  players_met  integer,
  -- Round 28, item 4.
  country      text,
  skill_level  text,
  positions    text[]
);

create function public.public_player_profile(p_nickname text)
returns public.public_profile
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- `policy.game.durationMinutes`, restated: SQL cannot read a TypeScript
  -- module, and if the two disagree a profile's hours and the same player's
  -- own account page disagree.
  v_default_minutes constant integer := 60;

  v_player public.players%rowtype;
  v_out    public.public_profile;
begin
  if p_nickname is null or btrim(p_nickname) = '' then
    return null;
  end if;

  -- A REAL, SIGNED-UP PLAYER ONLY. `auth_user_id is null` is exactly the
  -- definition of a guest (R24), and none of them is a person with a profile.
  select * into v_player
    from public.players p
   where lower(p.nickname) = lower(btrim(p_nickname))
     and p.auth_user_id is not null;

  if not found then
    return null;
  end if;

  v_out.nickname   := v_player.nickname;
  v_out.photo_path := v_player.photo_path;
  v_out.cover_path := v_player.cover_path;

  /*
   * THE THREE NEW FIELDS (round 28, item 4).
   *
   * `skill_level` is cast to text at the boundary rather than exported as the
   * enum: the composite is read by PostgREST and a bare enum there is a type
   * the client has to learn. The catalog is still the enum's — a value that is
   * not one of beginner/intermediate/advanced cannot be in the column.
   */
  v_out.country     := v_player.country;
  v_out.skill_level := v_player.skill_level::text;
  v_out.positions   := coalesce(v_player.positions, '{}');

  -- The spot was held to the end AND the game happened. Attendance is NOT
  -- consulted here and that is unchanged: marking it is an admin's optional
  -- act, so a game nobody settled would silently stop counting.
  select
      count(*)::integer,
      coalesce(sum(coalesce(g.duration_minutes, v_default_minutes)), 0)::numeric / 60,
      count(distinct coalesce(g.venue_id::text, g.venue))::integer
    into v_out.games_played, v_out.hours, v_out.venues
    from public.bookings b
    join public.games g on g.id = b.game_id
   where b.player_id = v_player.id
     and b.status in ('reserved', 'confirmed')
     and g.status in ('played', 'settled');

  v_out.players_met := public.players_met(v_player.id);

  return v_out;
end;
$$;

revoke execute on function public.public_player_profile(text) from public;
grant execute on function public.public_player_profile(text) to anon, authenticated, service_role;

comment on function public.public_player_profile(text) is
  'The public roster-tap profile. Round 28 item 4 widened it to country, '
  'skill level and preferred positions — football facts the player already '
  'supplies. Contact details and join date remain out of scope (round 14).';

-- -----------------------------------------------------------------------------
-- The capability flag
--
-- Restated in full, so applying this alone cannot switch another feature off.
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
    'publicProfileScope',     true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
do $$
declare
  v_caps jsonb;
  v_id   uuid;
  v_nick text;
  v_prof public.public_profile;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'publicProfileScope')::boolean, false) is not true then
    raise exception 'public scope: the capability flag did not turn on';
  end if;

  select id, nickname into v_id, v_nick
    from public.players where auth_user_id is not null order by created_at limit 1;
  if v_id is null then
    raise notice 'public scope: no signed-up player — shape checked, values NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    update public.players
       set country = 'CZ', skill_level = 'intermediate', positions = array['gk']
     where id = v_id;

    v_prof := public.public_player_profile(v_nick);

    if v_prof.country is distinct from 'CZ' then
      raise exception 'public scope: country did not project (got %)', v_prof.country;
    end if;
    if v_prof.skill_level is distinct from 'intermediate' then
      raise exception 'public scope: skill level did not project (got %)', v_prof.skill_level;
    end if;
    if v_prof.positions is distinct from array['gk'] then
      raise exception 'public scope: positions did not project';
    end if;

    -- UNSET STAYS UNSET. The page omits what is null; it must not be coerced.
    update public.players
       set country = null, skill_level = null, positions = '{}'
     where id = v_id;

    v_prof := public.public_player_profile(v_nick);
    if v_prof.country is not null or v_prof.skill_level is not null then
      raise exception 'public scope: an unset field came back non-null';
    end if;
    if array_length(v_prof.positions, 1) is not null then
      raise exception 'public scope: unset positions came back non-empty';
    end if;

    -- AND THE ROUND-14 BOUNDARY STILL HOLDS: no contact detail crossed.
    if v_prof::text like '%@%' then
      raise exception 'public scope: something that looks like an email crossed the boundary';
    end if;

    raise notice 'public scope: verified — three fields project, unset stays unset';
  end;
end $$;
