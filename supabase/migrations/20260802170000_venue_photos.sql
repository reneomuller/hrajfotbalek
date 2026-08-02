-- =============================================================================
-- Migration 34 — venue photographs, uploaded rather than committed
--
-- Until now a venue's photo had to be a file committed under `public/venues/`,
-- which meant adding a pitch photograph was a deploy. §5.4 always intended
-- "human-supplied real pitch photographs"; it did not intend that the human be
-- a developer. An organizer adding next month's venue can now photograph it
-- and upload it from the game form.
--
-- THE COMMITTED-ASSET PATH STAYS WORKING. `venues.image_path` continues to
-- accept `/venues/<file>.<ext>`, and the two venues already using it are
-- untouched. The CHECK is WIDENED, not replaced — a bucket key is a second
-- permitted shape, not a migration of the first.
--
-- WHY THE COLUMN RATHER THAN A NEW ONE. `VenueMapPanel` already branches on
-- `image_path`; a second column would mean every render site choosing between
-- them, and the first site to forget would render the wrong photo or none.
-- One column, two shapes, one reader.
--
-- Rollback: supabase/rollback/20260802170000_venue_photos_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The widened shape
--
-- `/venues/<file>.<ext>`   — a committed repo asset, as before
-- `venues/<uuid>.<ext>`    — a key in the venue-photos bucket (no leading slash)
--
-- The two are distinguishable by that leading slash, which is what lets one
-- reader tell them apart without a flag column. Both are still anchored and
-- still forbid a scheme, a host or a traversal: the value reaches an `<img
-- src>`, and this constraint is the first line rather than the second.
-- -----------------------------------------------------------------------------

alter table public.venues drop constraint venues_image_path_format;

alter table public.venues add constraint venues_image_path_format check (
  image_path is null
  or image_path ~ '^/venues/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpg|jpeg|webp|avif)$'
  or image_path ~ '^venues/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
);

comment on column public.venues.image_path is
  'Either a committed repo asset (`/venues/x.jpg`, leading slash) or a key in '
  'the venue-photos bucket (`venues/<uuid>.jpg`, no leading slash). The slash '
  'is what tells a reader which it is — see components/VenueMapPanel.tsx.';

-- =============================================================================
-- The bucket
--
-- PUBLIC READ, ADMIN WRITE. Same shape as `profile-photos` (migration 24) with
-- one difference that matters: there is no per-object owner here, because a
-- venue belongs to nobody. So the write policies check `is_admin_caller()`
-- rather than matching a path segment against the caller's id.
--
-- 4 MiB rather than 2: a pitch photographed in landscape carries more than a
-- cropped square avatar, and the panel renders it at 220px tall on a phone but
-- full width on a desktop.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-photos',
  'venue-photos',
  true,
  4194304, -- 4 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies are a SEPARATE policy surface from table RLS and get the
-- same deny-by-default care. Dropped first so re-running this migration is
-- idempotent rather than a duplicate-name error.
drop policy if exists venue_photos_public_read on storage.objects;
drop policy if exists venue_photos_admin_insert on storage.objects;
drop policy if exists venue_photos_admin_update on storage.objects;
drop policy if exists venue_photos_admin_delete on storage.objects;

-- Read: everyone. The panel renders for a signed-out visitor arriving from a
-- shared link, and the bucket being public is what makes the URL a pure
-- function of the key rather than a round trip.
create policy venue_photos_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'venue-photos');

-- Write: admins only. A venue photograph is published content — it appears on
-- every game at that pitch, to everyone — so the gate is the same one that
-- guards creating the game.
create policy venue_photos_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'venue-photos' and public.is_admin_caller());

create policy venue_photos_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'venue-photos' and public.is_admin_caller())
  with check (bucket_id = 'venue-photos' and public.is_admin_caller());

create policy venue_photos_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'venue-photos' and public.is_admin_caller());

-- =============================================================================
-- set_venue_photo — claims the key, then the client uploads to it
--
-- THE PATH IS DERIVED HERE, NEVER CHOSEN BY THE CLIENT. It is
-- `venues/<venue id>.<ext>`: deterministic, so a re-upload replaces rather than
-- accumulates, and impossible to point at another venue's key by asking.
--
-- The row is written FIRST and the object uploaded second, matching
-- `set_profile_photo`. A failed upload then leaves a row pointing at a key with
-- no object — which renders as the no-photo fallback, because the panel checks
-- the shape and the browser 404s the image. The other order risks an orphan
-- object in a public bucket with nothing pointing at it and nothing to clean it
-- up.
-- =============================================================================

create function public.set_venue_photo(p_venue_id uuid, p_extension text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_extension not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'INVALID_IMAGE_TYPE' using detail = p_extension;
  end if;

  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  v_path := 'venues/' || p_venue_id::text || '.' || p_extension;

  update public.venues set image_path = v_path where id = p_venue_id;

  return v_path;
end $$;

revoke execute on function public.set_venue_photo(uuid, text) from public, anon;
grant execute on function public.set_venue_photo(uuid, text) to authenticated, service_role;

comment on function public.set_venue_photo(uuid, text) is
  'Admin-only. Derives venues/<venue id>.<ext> and records it, returning the '
  'key for the caller to upload to. The client never chooses the path.';

-- -----------------------------------------------------------------------------
-- clear_venue_photo — back to the name-and-map fallback
--
-- Returns the key that was there so the caller can delete the object;
-- `storage.objects` is not reachable from plpgsql, exactly as
-- `remove_profile_photo` documents.
-- -----------------------------------------------------------------------------

create function public.clear_venue_photo(p_venue_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  select image_path into v_path from public.venues where id = p_venue_id;
  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  update public.venues set image_path = null where id = p_venue_id;

  -- Only a BUCKET key is the caller's to delete. A committed repo asset is in
  -- git, and returning its path would invite a delete call against an object
  -- that does not exist in storage at all.
  return case when v_path like 'venues/%' then v_path end;
end $$;

revoke execute on function public.clear_venue_photo(uuid) from public, anon;
grant execute on function public.clear_venue_photo(uuid) to authenticated, service_role;
