-- =============================================================================
-- Migration 38 — what a venue actually provides
--
-- v1.2 §5.7 wants a "What's included" grid on the game page: bibs, gloves,
-- balls, water, and the facilities a pitch happens to have. Until now the only
-- statement of this in the product was one sentence of fixed copy on the
-- landing page — "Training bibs, goalie gloves and balls provided." — which is
-- a promise made about EVERY game by a string table.
--
-- THAT SENTENCE IS THE PROBLEM THIS MIGRATION FIXES, not just the absence of a
-- grid. It is true of the pitches this product runs today and there is no way
-- to make it untrue when it stops being: the first indoor hall that does not
-- lend gloves would have the page promising them anyway, and the player finds
-- out with cold hands. A claim about a specific venue belongs to that venue's
-- row.
--
-- A CLOSED CATALOG, NOT FREE TEXT. Each value renders as an icon and a label,
-- and an icon table is a closed set by construction — an amenity nobody has an
-- icon for renders as a gap. The CHECK is the same shape as
-- `events_event_type_catalog`: drop and re-add to widen, restating the list in
-- full, and the icon map in `lib/venues/amenities.ts` must be widened with it.
--
-- THE THREE EXISTING PROMISES ARE BACKFILLED ONTO EVERY VENUE, so nothing the
-- landing page already claims stops being claimed. That is a deliberate
-- assertion rather than a null default: the copy has been making it site-wide
-- for a year, and moving it into rows that an organizer can now edit is
-- strictly more honest than leaving it in a string table nobody can turn off.
--
-- Rollback: supabase/rollback/20260802210000_venue_amenities_down.sql
-- =============================================================================

alter table public.venues
  add column amenities text[] not null default array[]::text[];

/*
 * The catalog. Two kinds of thing, deliberately in one column:
 *
 *   PROVIDED — bibs, gloves, balls, water. Things the organizer brings.
 *   FACILITIES — showers, parking, lockers, wifi, first aid, drinks. Things
 *                the pitch has.
 *
 * They are one list because the player's question is one question: "what do I
 * need to bring, and what will be there". Splitting them into two columns
 * would mean two grids answering halves of it, and a decision at every new
 * amenity about which half it belongs to.
 */
alter table public.venues add constraint venues_amenities_catalog check (
  amenities <@ array[
    'bibs', 'gloves', 'balls', 'water',
    'showers', 'parking', 'lockers', 'wifi', 'first_aid', 'drinks'
  ]::text[]
);

/*
 * No duplicates — "Bibs provided" twice in the grid is a rendering defect from
 * a state the column would otherwise permit.
 *
 * THROUGH A FUNCTION, because a CHECK cannot contain a subquery and the obvious
 * `array(select distinct unnest(...))` is one. It must be IMMUTABLE for the
 * planner to accept it here, which it genuinely is: it reads nothing but its
 * argument. `array_length(x, 1)` is NULL for an empty array, hence the coalesce
 * — a venue with no amenities recorded must not fail this.
 */
create function public.array_is_distinct(p_values text[])
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select coalesce(array_length(p_values, 1), 0)
       = coalesce(array_length(array(select distinct unnest(p_values)), 1), 0)
$$;

comment on function public.array_is_distinct(text[]) is
  'True when the array holds no repeated value. Exists because a CHECK '
  'constraint cannot contain a subquery — see venues_amenities_distinct.';

alter table public.venues add constraint venues_amenities_distinct check (
  public.array_is_distinct(amenities)
);

comment on column public.venues.amenities is
  'Closed catalog — see venues_amenities_catalog and lib/venues/amenities.ts, '
  'which must be widened together. Rendered as the game page''s "What''s '
  'included" grid.';

-- The three the product has been promising site-wide in fixed copy. Backfilled
-- so the claim survives the move, and now editable per venue.
update public.venues
   set amenities = array['bibs', 'gloves', 'balls']::text[]
 where amenities = array[]::text[];

-- =============================================================================
-- set_venue_amenities — admin-only, and it REPLACES rather than merges
--
-- The admin surface is a set of checkboxes, so what the form knows is the whole
-- desired set. A merge-shaped RPC would make unticking a box a no-op — the one
-- operation an organizer most needs when a pitch stops lending gloves.
--
-- Validated here as well as by the CHECK: the CHECK produces a constraint-name
-- error and this produces a named one the admin error map can translate.
-- =============================================================================

create function public.set_venue_amenities(p_venue_id uuid, p_amenities text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean text[];
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  -- Distinct and ordered, so two admins ticking the same boxes in a different
  -- order produce the same row and the grid renders in one stable order rather
  -- than in the order somebody happened to click.
  select coalesce(array_agg(a order by a), array[]::text[])
    into v_clean
    from (select distinct unnest(coalesce(p_amenities, array[]::text[])) as a) s;

  if not (v_clean <@ array[
    'bibs', 'gloves', 'balls', 'water',
    'showers', 'parking', 'lockers', 'wifi', 'first_aid', 'drinks'
  ]::text[]) then
    raise exception 'AMENITY_UNKNOWN' using detail = array_to_string(v_clean, ',');
  end if;

  update public.venues set amenities = v_clean where id = p_venue_id;

  return v_clean;
end $$;

revoke execute on function public.set_venue_amenities(uuid, text[]) from public, anon;
grant execute on function public.set_venue_amenities(uuid, text[]) to authenticated, service_role;

comment on function public.set_venue_amenities(uuid, text[]) is
  'Admin-only. REPLACES the venue''s amenity set — unticking a box must be a '
  'real operation. Deduplicates and sorts so the grid order is stable.';
