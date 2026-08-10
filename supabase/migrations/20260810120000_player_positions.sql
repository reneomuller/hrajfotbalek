-- =============================================================================
-- players.positions — the preferred-position chips (ruling L, §2.8 / §3 screen 7)
--
-- SCOPE AMENDMENT, 2026-08-10. `SCOPE.md` §2 rules this round front-end and
-- says a round that drags a schema change behind it stops being one. The owner
-- amended that for this column specifically, on the reasoning that ruling L's
-- position chips are the one genuinely new interaction the ruling specifies and
-- are inert without somewhere to store them. Recorded in SCOPE.md beside the
-- rule it bends, the same way ruling J's partial reversal is recorded beside
-- the order it changes — an un-amended rule is how an amendment gets quietly
-- reverted by a later session reading the document faithfully.
--
-- ADDITIVE ONLY. A new column, a widened per-column UPDATE grant, and nothing
-- else. Own-row RLS is untouched, every existing CHECK stands, and no other
-- column joins the grant.
--
-- PLURAL, AND THAT IS A DELIBERATE DEPARTURE from the column name the
-- amendment used. Ruling L §2.8 requires the chips be drawn "in the state where
-- more chips are SELECTED than fit one row", which is only reachable if a
-- player can hold several — and players do play several. A `text[]` named
-- `position` would read as one value to everyone who met it afterwards.
--
-- Rollback: supabase/rollback/20260810120000_player_positions_down.sql
-- =============================================================================

alter table public.players
  add column if not exists positions text[] not null default array[]::text[];

/*
 * A CLOSED CATALOG, the same shape as `venues_amenities_catalog`.
 *
 * Codes rather than words, because the labels are translated into three
 * languages and a column holding "Brankář" for one player and "Goalkeeper" for
 * another is a column nobody can group by. `lib/players/positions.ts` is the
 * render list and must be widened in the same commit as this constraint —
 * Postgres cannot extend a CHECK in place, so widening means drop and re-add
 * restating the list in full.
 *
 * Four values, matching the amendment: goalkeeper, defender, midfielder,
 * attacker. Deliberately not a deeper taxonomy — this is a pickup game, and a
 * chip set that distinguishes a left wing-back from a right one is a form
 * nobody finishes.
 */
alter table public.players add constraint players_positions_catalog check (
  positions <@ array['gk', 'def', 'mid', 'att']::text[]
);

/*
 * No duplicates. Reuses `array_is_distinct` from the venue-amenities migration
 * — it is already `immutable`, `strict` and `parallel safe`, which is what a
 * CHECK needs, and it takes `text[]`. A second copy of the same function under
 * a different name is how two constraints come to disagree about what distinct
 * means.
 */
alter table public.players add constraint players_positions_distinct check (
  public.array_is_distinct(positions)
);

comment on column public.players.positions is
  'Preferred positions, closed catalog — see players_positions_catalog and '
  'lib/players/positions.ts, which must be widened together. Player-editable '
  'through the per-column grant below; empty is the normal state for every '
  'player who predates this column.';

-- =============================================================================
-- The grant
--
-- WIDENED TO EXACTLY THREE COLUMNS, and no more. `country` and `skill_level`
-- have existed since migration 21 and were deliberately left out of the
-- client-writable set — that migration says so in as many words. The reason was
-- that nothing but `complete_signup_v2` wrote them; ruling L gives them an edit
-- surface, so the reason expires and the grant follows.
--
-- WHAT DOES NOT JOIN: `nickname`, `phone` and `marketing_opt_in` are already
-- granted from migration 1 and are untouched here. `is_admin`, `is_seed`,
-- `email`, `auth_user_id`, `tos_accepted_at`, `tos_version` and `photo_path`
-- stay out. `is_admin` in particular is grantable only through the Supabase
-- dashboard, and a client-writable admin flag is a privilege escalation with a
-- form in front of it.
--
-- ROW ACCESS IS UNCHANGED. The `players_update_own` RLS policy is what confines
-- these writes to the caller's own row; this grant only says which COLUMNS a
-- write may name. Both are required and neither substitutes for the other.
-- =============================================================================

grant update (country, skill_level, positions) on public.players to authenticated;
