-- =============================================================================
-- ROUND 30, ITEM 2 — an admin can remove a player's BANNER, not only their
-- profile photograph.
--
-- WHY A NEW FUNCTION RATHER THAN A WIDER OLD ONE. Two already exist and
-- neither fits:
--
--   `remove_profile_photo(p_player_id)` is the admin's, and is about the
--     AVATAR. Teaching it a second target would make one call site mean two
--     different acts depending on an argument.
--   `clear_cover_photo()` takes NO argument — it reads `current_player_id()`
--     and clears the caller's OWN banner. An admin calling it would wipe their
--     own. That is exactly the shape of bug this repo has been bitten by, so
--     the admin path gets its own function with the subject named explicitly.
--
-- IT RETURNS THE PATH, like its sibling, because the OBJECT deletion belongs
-- to the caller: storage is an HTTP API and this is a transaction. Null means
-- there was nothing to remove, which is not an error — moderating an
-- already-removed banner is idempotent, and an event log that records
-- non-events is one nobody can count.
--
-- THE EVENT CATALOG IS NOT WIDENED. A removed banner is a
-- `profile_photo_removed` with `kind: 'cover'` in its metadata — the act is
-- the same act on a different column, and a new event type would mean every
-- reader of that stream needs teaching about a second one. CLAUDE.md's catalog
-- trap is avoided by not needing the catalog.
-- =============================================================================

create or replace function public.remove_profile_cover(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_path  text;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  select cover_path into v_path from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Nothing to remove: no write, and no event.
  if v_path is null then
    return null;
  end if;

  update public.players set cover_path = null where id = p_player_id;

  v_actor := public.current_player_id();
  insert into public.events (event_type, player_id, metadata)
  values ('profile_photo_removed', p_player_id,
          jsonb_build_object('by_player_id', v_actor, 'path', v_path, 'kind', 'cover'));

  -- The path the caller must now delete from the bucket.
  return v_path;
end;
$$;

revoke execute on function public.remove_profile_cover(uuid) from public;
grant execute on function public.remove_profile_cover(uuid) to authenticated, service_role;

comment on function public.remove_profile_cover(uuid) is
  'Admin moderation of a player BANNER. Returns the storage path the caller '
  'must delete, or null when there was nothing to remove.';

-- -----------------------------------------------------------------------------
-- The capability flag
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',          true,
    'dismissNotifications',   true,
    'adminRemoveBooking',     true,
    'adminDelete',            true,
    'cancelWithReason',       true,
    'gameLanguage',           true,
    'organizerTelegram',      true,
    'playersMet',             true,
    'playedSweep',            true,
    'playerNotifications',    true,
    'pendingSeatAnonymous',   true,
    'payFirstCheckout',       true,
    'addGuestsAfterBooking',  true,
    'publicProfileScope',     true,
    'creditLedgerNote',       true,
    'autoSettle',             true,
    'adminRemoveCover',       true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — SHAPE ONLY
--
-- No fixture, no write, no writing RPC. See CLAUDE.md, "A migration's
-- verification block may not write a row"; the behaviour is drilled in
-- `supabase/tests/admin_remove_cover.sql`, which `run.mjs` rolls back.
-- -----------------------------------------------------------------------------
do $$
begin
  if coalesce((public.app_capabilities() ->> 'adminRemoveCover')::boolean, false) is not true then
    raise exception 'remove cover: the capability flag did not turn on';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'remove_profile_cover') then
    raise exception 'remove cover: the function is missing';
  end if;

  if pg_get_function_result((select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' and p.proname='remove_profile_cover')) <> 'text' then
    raise exception 'remove cover: it must return the storage path';
  end if;

  -- `anon` must never reach it; `authenticated` must, because the admin session
  -- IS an authenticated one and the admin check lives inside the function.
  if has_function_privilege('anon',
       (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='remove_profile_cover'), 'EXECUTE') then
    raise exception 'remove cover: anon can execute it';
  end if;

  raise notice 'remove cover: shape verified — behaviour is drilled in supabase/tests/admin_remove_cover.sql';
end $$;
