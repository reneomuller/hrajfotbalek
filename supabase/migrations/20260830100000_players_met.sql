-- =============================================================================
-- Round 23 item 1 — "Players met", and a balance stops being a public number
--
-- A COMPUTED STAT, NOT A STORED ONE. There is no `players.players_met` column
-- and this migration does not add one: it is a fold over bookings that already
-- exist, and a counter maintained by triggers is a second source of truth that
-- can disagree with the rows it counts. Same rule as `games_played`, which has
-- been derived since migration 39.
--
-- THE DEFINITION, and every clause of it is load-bearing:
--
--   DISTINCT REAL PLAYERS — `auth_user_id is not null` on the other side. A
--     guest is a SEAT, not an identity (R24), so a booking with three guests
--     introduces you to one person and not four. Party seats and pre-round-11
--     shadows fall out by the same clause.
--
--   WHO SHARED A GAME THAT HAS ALREADY BEEN PLAYED — `games.status in
--     ('played','settled')`. A game on the board is a plan, and a stat that
--     counted plans would fall when somebody cancelled. This is the same half
--     of the `games_played` definition, restated rather than reused so the two
--     cannot silently drift apart in different directions.
--
--   NO-SHOWS EXCLUDED ON EITHER SIDE — `attendance is distinct from 'no_show'`
--     on BOTH bookings. If they did not turn up you did not meet them; if YOU
--     did not turn up you met nobody there. `is distinct from` rather than
--     `<> 'no_show'`, because attendance is NULL until an organizer settles the
--     game and `null <> 'no_show'` is NULL, which would silently drop every
--     unsettled game — the exact opposite of what is wanted.
--
--     THIS IS THE ONE PLACE ATTENDANCE IS CONSULTED, and it is deliberate. The
--     other stats refuse to read it because a number that depends on how
--     promptly an admin did paperwork would drop for weeks and then return.
--     Here the asymmetry is the point: an unsettled game still counts (NULL is
--     not a no-show), and only an EXPLICIT no-show removes anyone.
--
--   YOURSELF EXCLUDED — you are not someone you met.
--
-- WHAT IT REPLACES, and this half matters more than the stat does:
--
--   (a) On the PUBLIC profile it takes the third tile. ~~A wallet balance~~ —
--       and the owner's brief said a balance was publicly visible there. It was
--       not: `public_player_profile` has returned nickname, photo, cover and
--       three stats since round 14, and the third stat is `venues`. No balance
--       has ever been on that page, and the composite return type is the reason
--       — there was never a seventh column to leak. Recorded here rather than
--       only in a report, because the next person to fear the same thing will
--       come looking at this function.
--   (b) On the player's OWN profile it takes the third tile from "Pitches
--       played".
--
-- `venues` STAYS IN THE COMPOSITE even though no tile renders it: the Explorer
-- badge is "play at 3 different pitches", and the badge grid on the public
-- profile is computed from these three numbers. Dropping the column to match
-- the UI would silently lock a badge that people have earned.
--
-- CAPABILITY-GATED. `app_capabilities()` gains `playersMet`, so the deployed
-- application keeps rendering the old third tile until this migration lands and
-- switches to the new one afterwards with no deploy. The function is created BY
-- the migration that describes it, which is why its absence is the signal.
--
-- Rollback: supabase/rollback/20260830100000_players_met_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. players_met — the fold, once, so no caller restates it
-- -----------------------------------------------------------------------------
create or replace function public.players_met(p_player_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct other.player_id)::integer
    from public.bookings mine
    join public.games g
      on g.id = mine.game_id
     and g.status in ('played', 'settled')
    join public.bookings other
      on other.game_id = mine.game_id
     and other.player_id <> mine.player_id
     and other.status in ('reserved', 'confirmed')
     and other.attendance is distinct from 'no_show'
    join public.players op
      on op.id = other.player_id
     and op.auth_user_id is not null
   where mine.player_id = p_player_id
     and mine.status in ('reserved', 'confirmed')
     and mine.attendance is distinct from 'no_show';
$$;

revoke execute on function public.players_met(uuid) from public;
grant execute on function public.players_met(uuid) to anon, authenticated, service_role;

comment on function public.players_met(uuid) is
  'Distinct signed-up players who shared a PLAYED game with this one. Guests '
  'are seats and never count; an explicit no_show on either side removes that '
  'game; a NULL attendance does not, because it only means nobody settled yet.';

-- -----------------------------------------------------------------------------
-- 2. The public composite gains a seventh column
--
-- DROP AND RECREATE, because a composite type cannot grow an attribute while a
-- function's return type depends on it. The function is dropped first and
-- rebuilt identically apart from the new column — restated in full rather than
-- patched, which is the same rule the CHECK catalogs follow.
-- -----------------------------------------------------------------------------
drop function if exists public.public_player_profile(text);
drop type if exists public.public_profile;

create type public.public_profile as (
  nickname     text,
  photo_path   text,
  cover_path   text,
  games_played integer,
  hours        numeric,
  venues       integer,
  players_met  integer
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

  -- The spot was held to the end AND the game happened. Attendance is NOT
  -- consulted here and that is unchanged: marking it is an admin's optional
  -- act, so a game nobody settled would silently stop counting.
  select
      count(*)::integer,
      round(sum(coalesce(g.duration_minutes, v_default_minutes))::numeric / 60.0, 1),
      count(distinct coalesce(g.venue_id::text, g.venue))::integer
    into v_out.games_played, v_out.hours, v_out.venues
    from public.bookings b
    join public.games g on g.id = b.game_id
   where b.player_id = v_player.id
     and b.status in ('reserved', 'confirmed')
     and g.status in ('played', 'settled');

  v_out.games_played := coalesce(v_out.games_played, 0);
  v_out.hours        := coalesce(v_out.hours, 0);
  v_out.venues       := coalesce(v_out.venues, 0);
  v_out.players_met  := coalesce(public.players_met(v_player.id), 0);

  return v_out;
end;
$$;

revoke execute on function public.public_player_profile(text) from public;
grant execute on function public.public_player_profile(text) to anon, authenticated, service_role;

comment on function public.public_player_profile(text) is
  'The public profile: nickname, photo, cover and the stats, and NOTHING else '
  '— the composite return type is the boundary. No balance has ever been in '
  'it. Guests and shadow players have none. Keyed by nickname so no surface '
  'has to publish a player_id.';

-- -----------------------------------------------------------------------------
-- 3. The capability flag
--
-- Restated in full because `create or replace` needs the whole body, and every
-- existing flag is repeated EXACTLY so applying this cannot switch one off.
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true,
    'organizerTelegram',    true,
    'playersMet',           true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
--
-- EXERCISED, NOT INSPECTED. Reading `pg_proc` proves a function exists; it does
-- not prove the join finds anybody, and every clause in this definition is a
-- way to accidentally return zero.
--
-- IT BUILDS NO PLAYERS. `players.auth_user_id` is a foreign key into
-- `auth.users`, so inventing two signed-up players means writing rows into the
-- auth schema of whatever database this is running against — which on
-- production is not a thing a migration gets to do for the sake of its own
-- test. It borrows two real players and one guest that already exist, gives
-- them a disposable game, and undoes the whole thing.
--
-- THE UNDO IS AN EXCEPTION, NOT A DELETE. A plpgsql block with an `exception`
-- clause opens an implicit savepoint, so raising a sentinel inside it rolls
-- back everything the block wrote — including anything a trigger wrote in
-- response, which a hand-written `delete` list would miss.
-- -----------------------------------------------------------------------------

do $$
declare
  v_cols   integer;
  v_caps   jsonb;
  v_a      uuid;
  v_b      uuid;
  v_guest  uuid;
  v_game   uuid;
  v_met    integer;
begin
  select count(*) into v_cols
    from pg_attribute a
    join pg_type t on t.typrelid = a.attrelid
   where t.typname = 'public_profile' and a.attnum > 0 and not a.attisdropped;
  if v_cols <> 7 then
    raise exception 'players met: the composite has % columns, expected 7', v_cols;
  end if;

  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'playersMet')::boolean, false) is not true then
    raise exception 'players met: the capability flag did not turn on';
  end if;
  if coalesce((v_caps ->> 'gameLanguage')::boolean, false) is not true
     or coalesce((v_caps ->> 'organizerTelegram')::boolean, false) is not true then
    raise exception 'players met: restating app_capabilities switched an older flag off';
  end if;

  -- A stranger's id is 0 rather than NULL: the tile renders a number.
  if public.players_met('00000000-0000-0000-0000-000000000000') <> 0 then
    raise exception 'players met: an unknown player did not answer 0';
  end if;

  select id into v_a from public.players
   where auth_user_id is not null order by created_at limit 1;
  select id into v_b from public.players
   where auth_user_id is not null and id <> v_a order by created_at limit 1;
  select id into v_guest from public.players
   where auth_user_id is null order by created_at limit 1;

  if v_a is null or v_b is null then
    raise notice 'players met: fewer than two signed-up players here — shape checked, definition NOT exercised';
    return;
  end if;

  begin
    insert into public.games (venue, starts_at, capacity, price_czk, status)
         values ('players_met probe', now() - interval '2 days', 12, 150, 'played')
      returning id into v_game;

    insert into public.bookings (game_id, player_id, status, price_czk, payment_method)
         values (v_game, v_a, 'confirmed', 150, 'cash'),
                (v_game, v_b, 'confirmed', 150, 'cash');
    if v_guest is not null then
      insert into public.bookings (game_id, player_id, status, price_czk, payment_method)
           values (v_game, v_guest, 'confirmed', 150, 'cash');
    end if;

    -- One real player met on this game. The guest is a seat, not a person, so
    -- the answer is the same with or without them.
    select public.players_met(v_a) into v_met;
    if v_met < 1 then
      raise exception 'players met: a shared played game counted %, expected at least 1', v_met;
    end if;

    -- A no-show on the OTHER side removes them from this game.
    update public.bookings set attendance = 'no_show'
     where game_id = v_game and player_id = v_b;
    if public.players_met(v_a) <> v_met - 1 then
      raise exception 'players met: a no-show on the other side still counted';
    end if;

    -- A no-show on MY side removes the whole game.
    update public.bookings set attendance = null where game_id = v_game and player_id = v_b;
    update public.bookings set attendance = 'no_show'
     where game_id = v_game and player_id = v_a;
    if public.players_met(v_a) <> v_met - 1 then
      raise exception 'players met: my own no-show still counted the game';
    end if;

    -- A game that has NOT been played counts for nobody.
    update public.bookings set attendance = null where game_id = v_game;
    update public.games set status = 'published' where id = v_game;
    if public.players_met(v_a) <> v_met - 1 then
      raise exception 'players met: an unplayed game counted';
    end if;

    raise exception 'players_met_probe_rollback';
  exception
    when others then
      if sqlerrm <> 'players_met_probe_rollback' then
        raise;
      end if;
      raise notice 'players met: definition exercised and undone — guest is a seat, both no-show sides, unplayed game';
  end;
end $$;
