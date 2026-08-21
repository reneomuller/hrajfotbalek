-- =============================================================================
-- Round 14 item 13 — public player profiles, with the quarantine LIFTED
--
-- `SCOPE.md` §2 quarantined "public player profile" (R8) because a profile is
-- the surface where a product accidentally publishes a phone number. The owner
-- lifts it this round WITH AN EXACT SCOPE, and the scope is the whole ruling:
--
--   A PUBLIC PROFILE SHOWS FOUR THINGS. Profile picture. Banner. The three
--   profile stats. Badges. Nothing else — no contact details, no booking
--   history, no wallet or credits, no country, no join date, no positions.
--
-- THE FUNCTION IS THE BOUNDARY, not the page. A page that simply omitted the
-- other fields would be one careless `select *` away from publishing them, and
-- the fields are all on `players`, which anonymous callers cannot read at all.
-- So this returns a COMPOSITE with exactly six columns and there is no way to
-- ask it for a seventh.
--
-- KEYED BY NICKNAME, NOT BY ID. `game_roster_public` deliberately projects no
-- `player_id` and that boundary is not being widened for this: the nickname is
-- already public on every roster, `players_nickname_key` is unique on
-- `lower(nickname)` so the lookup is unambiguous, and it makes the URL
-- readable. Nothing anywhere gains the ability to turn a roster row into an id.
--
-- GUESTS HAVE NO PROFILE. A guest is a seat, not a person (R24), and a
-- pre-round-11 shadow is somebody who never signed up. Both are excluded here
-- as well as in the UI, so a hand-typed URL cannot reach one.
--
-- Rollback: supabase/rollback/20260821240000_public_player_profile_down.sql
-- =============================================================================

create type public.public_profile as (
  nickname     text,
  photo_path   text,
  cover_path   text,
  games_played integer,
  hours        numeric,
  venues       integer
);

create function public.public_player_profile(p_nickname text)
returns public.public_profile
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  /*
   * THE DURATION FALLBACK, RESTATED FROM `lib/policy.ts`.
   *
   * `policy.game.durationMinutes` is 60 and `games.duration_minutes` is
   * nullable — most games never set one. SQL cannot read a TypeScript module,
   * so this is the fourth window living in two places, and the rule is the
   * same as the others: if the two disagree, the profile's hours and this
   * player's own account page would disagree, which is the specific failure
   * worth avoiding here.
   */
  v_default_minutes constant integer := 60;

  v_player public.players%rowtype;
  v_out    public.public_profile;
begin
  if p_nickname is null or btrim(p_nickname) = '' then
    return null;
  end if;

  /*
   * A REAL, SIGNED-UP PLAYER ONLY. `auth_user_id is null` is exactly the
   * definition of a guest (R24) — a house seat, a party seat, or a
   * pre-round-11 shadow — and none of them is a person with a profile.
   */
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
   * THE THREE STATS, over the SAME definition `lib/profile/stats.ts` uses and
   * `game_roster_public.games_played` publishes: the spot was held to the end
   * (`reserved`/`confirmed`) AND the game happened (`played`/`settled`).
   *
   * Both halves are load-bearing. A counter that rises when you BOOK measures
   * intent; one that counts cancelled spots measures nothing. If this drifted
   * from the TypeScript, a player would read one number under their own face
   * and a different one under the same face on a public profile.
   *
   * ATTENDANCE IS NOT CONSULTED, deliberately and identically — `bookings.
   * attendance` exists and marking it is an admin's optional act, so a game
   * nobody settled would silently stop counting.
   */
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

  return v_out;
end;
$$;

revoke execute on function public.public_player_profile(text) from public;
grant execute on function public.public_player_profile(text) to anon, authenticated, service_role;

comment on function public.public_player_profile(text) is
  'The public profile: nickname, photo, cover and the three stats, and NOTHING '
  'else — the composite return type is the boundary. Guests and shadow players '
  'have none. Keyed by nickname so no surface has to publish a player_id.';

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------

do $$
declare v_cols integer;
begin
  select count(*) into v_cols
    from pg_attribute a
    join pg_type t on t.typrelid = a.attrelid
   where t.typname = 'public_profile' and a.attnum > 0 and not a.attisdropped;

  if v_cols <> 6 then
    raise exception 'public profile: the composite has % columns, expected 6', v_cols;
  end if;

  -- The roster's PII boundary is untouched by this migration, and the whole
  -- nickname-keyed design exists so that stays true.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
       and column_name in ('player_id', 'email', 'phone')
  ) then
    raise exception 'public profile: the roster view gained an identifier';
  end if;
end $$;
