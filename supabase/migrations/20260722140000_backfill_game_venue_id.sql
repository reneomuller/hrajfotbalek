-- =============================================================================
-- Migration 19 — backfill games.venue_id, and let the seed own its venues
--
-- WHY THIS EXISTS. `venues` arrived in migration 15, after every game then in
-- the database had already been created, so those rows kept `venue_id` null.
-- The admin edit form binds its venue picker to `venue_id`, and a null opened
-- that picker on "—". Saving then failed validation before it reached a single
-- RPC: the form answered "pick a venue, or add a new one" and wrote nothing,
-- while React reset the inputs the organizer had just typed into back to the
-- values still stored on the game. The reported symptom was "capacity and price
-- do not persist"; the cause was a null foreign key three fields above them.
--
-- WHY `games.venue` IS THE SOURCE. The name is the only thing a legacy row
-- carries, and `games.venue` is that name exactly as written at the time (see
-- migration 15 on why the text column stays). Names are matched
-- case-insensitively against existing venues — the same rule `venues_name_key`
-- enforces — so a venue already present is linked, never duplicated.
--
-- A row whose venue name cannot be a venue (empty, or longer than the 80
-- characters `venues_name_length` allows) is left null rather than truncated or
-- invented. None exist today; if one ever does, the edit form asks the
-- organizer to pick a venue, which is the correct outcome for a name the
-- database was never willing to store.
--
-- DELETE ON venues FOR service_role, on the same reasoning as migration 10:
-- `npm run seed:reset` now creates fixture venues and has to be able to remove
-- them. Venues are reference data with no state and no PII, and the grant is to
-- the server-only key — anon and authenticated keep SELECT and nothing else.
--
-- Rollback: supabase/rollback/20260722140000_backfill_game_venue_id_down.sql
-- =============================================================================

-- One venue per distinct legacy name that does not have one yet. `distinct on`
-- collapses the several games that share a pitch into a single venue row.
insert into public.venues (name)
select distinct on (lower(btrim(g.venue))) btrim(g.venue)
  from public.games g
 where g.venue_id is null
   and char_length(btrim(g.venue)) between 1 and 80
   and not exists (
     select 1 from public.venues v where lower(v.name) = lower(btrim(g.venue))
   )
 order by lower(btrim(g.venue)), g.created_at;

update public.games g
   set venue_id = v.id
  from public.venues v
 where g.venue_id is null
   and lower(v.name) = lower(btrim(g.venue));

grant delete on public.venues to service_role;

notify pgrst, 'reload schema';

comment on column public.games.venue_id is
  'Structured link to venues. games.venue keeps the display name as written at '
  'the time, so renaming a venue never rewrites a past game. Backfilled from '
  'games.venue by migration 19 — the admin edit form cannot save a game whose '
  'venue_id is null.';
