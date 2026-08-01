-- Rollback for 20260801100000_profile_photos.sql
--
-- The bucket row is dropped only if it is empty. Deleting a bucket that still
-- holds objects would orphan the files in the storage backend, and a rollback
-- that loses someone's photo is worse than one that refuses.

drop function if exists public.anonymize_player(uuid);
drop function if exists public.remove_profile_photo(uuid);
drop function if exists public.set_profile_photo(text);

drop policy if exists profile_photos_owner_delete on storage.objects;
drop policy if exists profile_photos_owner_update on storage.objects;
drop policy if exists profile_photos_owner_insert on storage.objects;
drop policy if exists profile_photos_public_read on storage.objects;

delete from storage.buckets
where id = 'profile-photos'
  and not exists (select 1 from storage.objects where bucket_id = 'profile-photos');

-- The catalog is left widened. Narrowing it would fail against any row already
-- carrying one of the two new types, and an unused allowed value costs nothing.
