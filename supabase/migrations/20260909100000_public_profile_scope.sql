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
-- Verification — SHAPE ONLY
--
-- THIS BLOCK MAY NOT WRITE A ROW, AND THE REASON COST A PRODUCTION CLEANUP.
--
-- Migrations used to end with a behavioural DRILL: build a fixture, exercise
-- the new RPCs, assert the outcome. Every one of them was validated inside
-- `begin; … rollback;`, so the fixtures vanished on every test run — and
-- `scripts/apply-migration.mjs` COMMITS. On 2026-09-12 round 29's drill was
-- applied to production and left behind a fake venue, two fake games, two
-- bookings against a real player, a real "you were marked as a no-show"
-- notification in his bell, two games' worth of inflated stats, 150 CZK of
-- phantom money owed, and a game the nightly sweep would have reported as
-- needing attention every night for ever.
--
-- SO THE RULE IS: a migration asserts that the SHAPE it created exists —
-- objects, columns, constraints, grants, capability flags. It never inserts,
-- never updates, never calls an RPC that writes. Behaviour is drilled in
-- `supabase/tests/`, where `run.mjs` wraps every suite in `begin; … rollback;`
-- BY DESIGN and a committing drill is structurally impossible.
--
-- See CLAUDE.md, "A migration's verification block may not write a row".
-- -----------------------------------------------------------------------------

do $$
declare v_cols text[];
begin
  if coalesce((public.app_capabilities() ->> 'publicProfileScope')::boolean, false) is not true then
    raise exception 'public scope: the capability flag did not turn on';
  end if;

  select array_agg(attname::text order by attname) into v_cols
    from pg_attribute
   where attrelid = 'public.public_profile'::regtype::text::regclass
     and attnum > 0 and not attisdropped;

  -- THE COMPOSITE IS THE BOUNDARY, so it is enumerated rather than sampled: a
  -- field that should never be public cannot arrive without somebody typing it
  -- here. Round 14's ruling, still bounding round 28's amendment.
  if v_cols is distinct from array['country','cover_path','games_played','hours',
                                   'nickname','photo_path','players_met','positions',
                                   'skill_level','venues'] then
    raise exception 'public scope: the composite is % rather than the ten allowed',
      coalesce(array_to_string(v_cols, ', '), '<none>');
  end if;

  if not has_function_privilege('anon',
        (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='public_player_profile'), 'EXECUTE') then
    raise exception 'public scope: anon cannot call public_player_profile';
  end if;

  raise notice 'public scope: shape verified — behaviour is drilled in supabase/tests/public_profile_scope.sql';
end $$;
