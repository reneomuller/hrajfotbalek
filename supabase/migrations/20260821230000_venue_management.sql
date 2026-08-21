-- =============================================================================
-- Round 13 item 24 — venues become a thing you manage, not a side effect
--
-- A venue could be CREATED (inside the game form, as a side effect of making a
-- game) and its photo and amenities could be edited — but only from the detail
-- page of some game that happened to be played there. Its NAME, its map link
-- and its pitch name could not be changed at all: there was no RPC.
--
-- So this adds the one function the management page needs. Everything else it
-- uses already exists: `admin_create_venue`, `set_venue_photo`,
-- `clear_venue_photo` and `set_venue_amenities`.
--
-- WHY A NAME EDIT IS SAFE, which is the question a rename always raises here:
-- `games.venue` is a SNAPSHOT taken at creation (migration 20260722110000) and
-- is deliberately not a foreign key to this text. Renaming a venue therefore
-- changes what FUTURE games are called and leaves every played game reading
-- what it read on the day. That is the behaviour the snapshot exists for.
--
-- Rollback: supabase/rollback/20260821230000_venue_management_down.sql
-- =============================================================================

create function public.admin_update_venue(
  p_venue_id   uuid,
  p_name       text,
  p_map_query  text default null,
  p_pitch_name text default null
)
returns public.venues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.venues;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_update_venue requires an admin session or service role';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'VENUE_NAME_REQUIRED';
  end if;

  if char_length(btrim(p_name)) > 80 then
    raise exception 'VENUE_NAME_TOO_LONG';
  end if;

  /*
   * EMPTY COLLAPSES TO NULL for the two optional fields, and that is not
   * tidiness: `map_query` null means "search for the venue name" and
   * `pitch_name` null means "this ground has no pitch name of its own". An
   * empty string is a THIRD state that renders as a blank where the fallback
   * should have been — the same distinction migration 41 drew for
   * `games.pitch_name`.
   */
  update public.venues
     set name       = btrim(p_name),
         map_query  = nullif(btrim(coalesce(p_map_query, '')), ''),
         pitch_name = nullif(btrim(coalesce(p_pitch_name, '')), '')
   where id = p_venue_id
   returning * into v_row;

  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.admin_update_venue(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_venue(uuid, text, text, text)
  to authenticated, service_role;

comment on function public.admin_update_venue(uuid, text, text, text) is
  'Admin-only. Renames a venue and sets its map query and pitch name. '
  'Renaming does NOT rewrite games already played there: games.venue is a '
  'snapshot taken at creation, deliberately not a foreign key to this text.';

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_update_venue'
  ) then
    raise exception 'venue management: admin_update_venue was not created';
  end if;

  if has_function_privilege('anon',
       'public.admin_update_venue(uuid, text, text, text)', 'EXECUTE') then
    raise exception 'venue management: admin_update_venue is callable by anon';
  end if;
end $$;
