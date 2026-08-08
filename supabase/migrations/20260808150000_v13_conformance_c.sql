-- =============================================================================
-- v1.3 conformance C — the roster view stops publishing who has not paid
--
-- `game_roster_public` projects `b.status`, the booking status, and the view is
-- granted SELECT to `anon`. So any caller holding the publishable anon key can
-- ask PostgREST directly:
--
--   /rest/v1/game_roster_public?select=nickname,status&status=eq.reserved
--
-- and receive a list of named players who have not paid. Verified against the
-- local stack before this migration was written; it returned four names.
--
-- THE DECISION WAS ALREADY MADE, AND EXECUTED ON ONE LAYER ONLY.
-- `components/game/PlayersList.tsx` says so in its own words:
--
--     THE BOOKING STATUS IS GONE from the row, deliberately. "Reserved"
--     versus "Confirmed" is the difference between having paid and not having
--     paid yet, which is nobody else's business on a public page and was never
--     information the reader could use. It survives where it belongs: on the
--     admin roster.
--
-- The render stopped displaying it. The view never stopped projecting it, and
-- `lib/games/queries.ts` still named it in the select. The column was gone from
-- the page and still on the wire — which is exactly the shape of gap CLAUDE.md
-- describes when it says a route guard is skipped by anyone using curl. Here
-- there was not even a guard to skip.
--
-- WHY A VIEW AND NOT A POLICY. RLS on the underlying `bookings` table is not
-- the lever: the view is the projection, and a projection that selects a column
-- publishes it. Narrowing the select is the whole fix.
--
-- WHAT IS DELIBERATELY UNCHANGED. `nickname`, `photo_path` and `games_played`
-- stay. §4a admits `photo_path` to this view AND NO OTHER, and `games_played`
-- counts played and settled games only — a counter that rose when you booked
-- would be measuring intent rather than attendance. Both are the widening this
-- view exists to carry.
--
-- The admin roster is unaffected: it reads `bookings` directly, where booking
-- status belongs and where only an admin can reach it.
--
-- Additive in the sense that matters: no object is dropped, no data is lost.
-- One column stops being published.
-- =============================================================================

-- DROP AND RECREATE, NOT `create or replace`.
--
-- Postgres refuses `create or replace view` here with "cannot drop columns from
-- view": replace may APPEND columns and may not remove one, which is exactly
-- what this migration does. The same rule that makes a widening cheap makes a
-- narrowing a drop.
--
-- Safe to drop: nothing depends on this view. Checked rather than assumed —
-- pg_depend/pg_rewrite report no dependent relation — so there is no CASCADE
-- here and there must never be one. A CASCADE would silently take out whatever
-- had come to depend on it, and the grant restored below would not bring it
-- back.
drop view public.game_roster_public;

create view public.game_roster_public as
  select
    b.game_id,
    p.nickname,
    p.photo_path,
    (
      select count(*)
        from public.bookings b2
        join public.games g2 on g2.id = b2.game_id
       where b2.player_id = p.id
         and b2.status in ('reserved', 'confirmed')
         and g2.status in ('played', 'settled')
    )::integer as games_played
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games   g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

-- The grant MUST be restored, and this is not belt-and-braces: `drop view`
-- takes the grants with it. The roster is the anon-readable projection the
-- games list counts player numbers from, so without this line every game on
-- the site would show zero players — and Supabase returns an empty set rather
-- than an error when a grant is missing, so the symptom would read as "nobody
-- has booked anything" rather than as a permissions fault.
grant select on public.game_roster_public to anon, authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name  = 'game_roster_public'
       and column_name = 'status'
  ) then
    raise exception 'v13_conformance_c: game_roster_public still projects status';
  end if;

  if not (
    select count(*) = 3 from information_schema.columns
     where table_schema = 'public'
       and table_name  = 'game_roster_public'
       and column_name in ('nickname', 'photo_path', 'games_played')
  ) then
    raise exception
      'v13_conformance_c: the view lost a column it was supposed to keep';
  end if;

  if not (has_table_privilege('anon', 'public.game_roster_public', 'SELECT')
          and has_table_privilege('authenticated', 'public.game_roster_public', 'SELECT')) then
    raise exception 'v13_conformance_c: the roster view lost its read grant';
  end if;
end $$;
