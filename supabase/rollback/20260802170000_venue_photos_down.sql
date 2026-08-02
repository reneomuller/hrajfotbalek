-- Rollback for 20260802170000_venue_photos.sql
--
-- NARROWING THE CHECK CAN INVALIDATE ROWS, so any venue pointing at a bucket
-- key has its photo cleared first. That loses the reference, not the object —
-- the bucket is dropped separately below and the file is gone with it, so
-- clearing the column is telling the truth rather than destroying evidence.
--
-- A venue whose photo was a committed repo asset is untouched: that shape was
-- valid before this migration and is valid after the rollback.

update public.venues set image_path = null where image_path like 'venues/%';

alter table public.venues drop constraint venues_image_path_format;

alter table public.venues add constraint venues_image_path_format check (
  image_path is null
  or image_path ~ '^/venues/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpg|jpeg|webp|avif)$'
);

drop function if exists public.clear_venue_photo(uuid);
drop function if exists public.set_venue_photo(uuid, text);

drop policy if exists venue_photos_admin_delete on storage.objects;
drop policy if exists venue_photos_admin_update on storage.objects;
drop policy if exists venue_photos_admin_insert on storage.objects;
drop policy if exists venue_photos_public_read on storage.objects;

-- Objects go with the bucket. They are photographs a human can retake, and
-- leaving a bucket nothing reads would leave public images with no purpose.
delete from storage.objects where bucket_id = 'venue-photos';
delete from storage.buckets where id = 'venue-photos';
