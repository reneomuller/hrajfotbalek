-- Rollback for 20260821230000_venue_management.
-- Additive: one function, no data. The management page loses its save button.
drop function if exists public.admin_update_venue(uuid, text, text, text);
