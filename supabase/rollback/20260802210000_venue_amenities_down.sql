-- Rollback for migration 38 — venues forget what they provide.
--
-- The column goes with the constraints, which means the per-venue claims are
-- lost rather than parked. That is the honest rollback: the alternative is a
-- column no writer can reach, whose values a later reader would trust.
-- `landing.equipmentLine` is still in the string table, so the site-wide
-- promise it replaced is intact.

drop function if exists public.set_venue_amenities(uuid, text[]);

alter table public.venues drop constraint if exists venues_amenities_distinct;
alter table public.venues drop constraint if exists venues_amenities_catalog;
alter table public.venues drop column if exists amenities;

-- After the constraint that needed it. `array_is_distinct` is general-purpose
-- but was introduced by this migration and has no other caller.
drop function if exists public.array_is_distinct(text[]);
