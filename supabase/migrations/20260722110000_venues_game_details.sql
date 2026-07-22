-- =============================================================================
-- Migration 15 — venues, and the per-game detail columns (format / surface /
--                notes)
--
-- Approved into the M4 leg alongside the admin panel, because all three are
-- things the admin game form has to write and there is no reason to make the
-- organizer wait for a second migration to describe their own games.
--
-- VENUES ARE NAMED ENTITIES, NOT A MAP API. `venues.image_path` points at a
-- human-supplied asset committed under `public/venues/` — no geocoding, no
-- third-party map service, no runtime fetch. The path is CHECK-constrained to
-- `/venues/<filename>` precisely because it is admin-supplied free text that
-- ends up in an `<img src>`: without the constraint the column would accept
-- `javascript:…` or an off-site URL, and the render site would faithfully use
-- it. Constrain the value where it is stored, not where it is displayed.
--
-- `games.venue` (text) STAYS. It is the display name every existing surface,
-- email, `.ics` file and OG card already reads, and it is snapshot-like: a
-- venue later renamed must not silently rewrite the name on a game that was
-- already played. `venue_id` is the structured link added beside it, and the
-- admin RPCs keep the two in step at write time.
--
-- Rollback: supabase/rollback/20260722110000_venues_game_details_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- venues
-- -----------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  -- Path under `public/`, or null for a venue with no photo yet. Anything that
  -- is not a plain `/venues/<file>` path is rejected here — see the header.
  image_path text,

  -- What to put in the Google Maps query when there is no image, or when the
  -- venue's name alone is too vague to find. Null means "use the name".
  map_query text,

  city text not null default 'prague',
  brand text not null default 'hrajfotbal',
  created_at timestamptz not null default now(),

  constraint venues_name_length check (char_length(name) between 1 and 80),
  constraint venues_image_path_format check (
    image_path is null
    or image_path ~ '^/venues/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpg|jpeg|webp|avif)$'
  ),
  constraint venues_map_query_length check (
    map_query is null or char_length(map_query) between 1 and 200
  )
);

create unique index venues_name_key on public.venues (lower(name));

-- -----------------------------------------------------------------------------
-- games — venue link + the three descriptive columns
--
-- All nullable: every game that exists today predates them, and a game whose
-- organizer has not said "6v6 turf" is a game with nothing to render there,
-- not a game in an invalid state.
-- -----------------------------------------------------------------------------

alter table public.games
  add column venue_id uuid references public.venues (id) on delete restrict,
  add column format   text,
  add column surface  text,
  add column notes    text;

-- `format` is rendered as-is next to the venue, so it is constrained to the
-- shape it claims to be rather than accepting arbitrary text in a chip.
alter table public.games
  add constraint games_format_format check (
    format is null or format ~ '^[0-9]{1,2}v[0-9]{1,2}$'
  );

-- A closed set: these are rendered as a label and drive nothing, but an
-- open text column here would be a free-text field pretending to be an enum,
-- and the stats surface would eventually try to group by it.
alter table public.games
  add constraint games_surface_known check (
    surface is null or surface in ('turf', 'grass', 'indoor', 'sand')
  );

-- Organizer logistics ("gate code 1234, park on the north side"). Bounded so
-- the game detail page cannot be turned into a document store.
alter table public.games
  add constraint games_notes_length check (
    notes is null or char_length(notes) <= 500
  );

create index games_venue_id_idx on public.games (venue_id);

-- =============================================================================
-- RLS — enabled in the same migration that creates the table
-- =============================================================================

alter table public.venues enable row level security;

revoke all on public.venues from anon, authenticated;

-- Venues are public reference data: the name and photo are rendered on the
-- landing page and the game detail page for signed-out visitors. There is no
-- PII here, and no per-row visibility rule to express — unlike `games`, a
-- venue has no draft state to hide.
create policy venues_select_public
  on public.venues
  for select
  to anon, authenticated
  using (true);

grant select on public.venues to anon, authenticated;

-- No client INSERT/UPDATE/DELETE: venues are written by `admin_create_venue`,
-- which is SECURITY DEFINER and checks for an admin caller inside the function.

grant select on public.venues to service_role;

comment on table public.venues is
  'Named venues with an optional human-supplied image under public/venues/. '
  'Public read; writes only through admin_create_venue.';
comment on column public.games.venue_id is
  'Structured link to venues. games.venue keeps the display name as written '
  'at the time, so renaming a venue never rewrites a past game.';
