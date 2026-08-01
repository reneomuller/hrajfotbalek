-- =============================================================================
-- Migration 24 — the profile-photos bucket, and the three RPCs around it
--
-- Phase 2 §4. This is the first storage bucket this project has ever had, so
-- there is no existing policy in the repo to copy and every decision below is
-- made from scratch rather than inherited.
--
-- STORAGE IS A SECOND POLICY SURFACE. `storage.objects` has its own RLS,
-- separate from every table policy written so far, and the Phase 1 lesson
-- applies to it unchanged: a missing grant returns empty rather than erroring,
-- so a photo that does not appear looks like a broken upload rather than a
-- missing policy. Each policy below states which role it is for and why.
--
-- THE KEY IS DERIVED, NOT CHOSEN. An object is `players/<player_id>.<ext>` and
-- nothing else, which is what makes the ownership policy expressible: the path
-- carries the owner, so "may this session write this object" is a question
-- about the path rather than about a lookup the client could influence. It also
-- means a re-upload REPLACES rather than accumulates — no orphan files, and no
-- cleanup job to write later.
--
-- WHY PUBLIC READ. Nicknames and avatars already appear on public rosters
-- (v2.5 §3), so the photo is public information by the same decision. Making
-- the bucket private would mean signing a URL per avatar per render, on a page
-- that shows a dozen of them, to protect something the roster shows anyway.
--
-- Rollback: supabase/rollback/20260801100000_profile_photos_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- the event catalog gains two types
--
-- Same drop-and-re-add as migration 20: Postgres cannot widen a CHECK in place,
-- and the list is restated in full rather than patched so what is in the
-- database always reads as one thing. Widening an allowed set destroys no data
-- and rejects nothing that was previously accepted.
--
-- `profile_photo_removed` is contract §4. `player_anonymized` is NOT in any
-- contract catalog yet and is flagged for ratification: v2.5 §3 requires every
-- state change to write its event in the same transaction, and anonymization
-- is the largest state change the product performs on a person — it cannot be
-- the one that happens silently.
-- -----------------------------------------------------------------------------

alter table public.events drop constraint events_event_type_catalog;

alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    -- identity / auth
    'account_created',
    'auth_link_sent',
    'auth_completed',
    'player_claimed',
    -- games
    'game_published',
    'game_cancelled',
    'game_settled',
    -- bookings
    'booking_created',
    'admin_booking_created',
    'booking_cancelled',
    'booking_expired',
    'spot_released',
    -- payments / credit
    'payment_confirmed',
    'payment_unmatched',
    'credit_issued',
    'credit_redeemed',
    -- waitlist
    'waitlist_joined',
    'waitlist_notified',
    'waitlist_converted',
    -- lifecycle sweeps
    'nudge_sent',
    'reminder_sent',
    -- settlement
    'attendance_marked',
    -- administration (migration 20)
    'admin_granted',
    'admin_revoked',
    -- profile (migration 24)
    'profile_photo_removed',
    'player_anonymized'
  )
);

-- -----------------------------------------------------------------------------
-- the bucket
--
-- Limits live HERE, not only in the browser. The client crop is an ergonomic
-- nicety; anything that reaches the API with a 30 MB TIFF has bypassed it, and
-- the bucket is the thing that says no.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  2097152, -- 2 MiB, per contract §4
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- object policies
--
-- SVG is absent from the MIME list above on purpose: it is a script container
-- that browsers render, and this bucket is public-read. "Image" is not a
-- safety property; these three formats are.
-- -----------------------------------------------------------------------------

-- Read: everyone. The bucket is public, so this mirrors what the CDN already
-- serves and keeps the storage API consistent with it.
create policy profile_photos_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'profile-photos');

/*
 * Write: your own object, and only yours.
 *
 * The path must be `players/<your player id>.<ext>`. `auth.uid()` is the AUTH
 * user; the path carries the PLAYER id, and the two are different columns —
 * hence the lookup. A client that supplies someone else's id writes a path this
 * predicate does not match, which is the point of putting the owner in the key.
 */
create policy profile_photos_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.players p
      where p.auth_user_id = auth.uid()
        and storage.objects.name like 'players/' || p.id::text || '.%'
    )
  );

create policy profile_photos_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.players p
      where p.auth_user_id = auth.uid()
        and storage.objects.name like 'players/' || p.id::text || '.%'
    )
  );

create policy profile_photos_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.players p
      where p.auth_user_id = auth.uid()
        and storage.objects.name like 'players/' || p.id::text || '.%'
    )
  );

-- =============================================================================
-- set_profile_photo — the owner records their own path
--
-- `players.photo_path` carries no UPDATE grant (migration 21), deliberately, so
-- the column cannot be written from a client even by the person it describes.
-- This is the one way in, and it derives the path itself rather than accepting
-- one: passing a path would hand the caller the ability to point their row at
-- somebody else's object, which is precisely the hole the key format closes.
-- =============================================================================

create function public.set_profile_photo(p_extension text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_path      text;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  if p_extension is null or p_extension !~ '^(jpg|jpeg|png|webp)$' then
    raise exception 'UNSUPPORTED_IMAGE_TYPE';
  end if;

  v_path := 'players/' || v_player_id::text || '.' || p_extension;

  update public.players set photo_path = v_path where id = v_player_id;

  return v_path;
end $$;

revoke execute on function public.set_profile_photo(text) from public, anon;
grant execute on function public.set_profile_photo(text) to authenticated;

comment on function public.set_profile_photo(text) is
  'Owner-only. Derives players/<own id>.<ext> and records it; never accepts a '
  'caller-supplied path.';

-- =============================================================================
-- remove_profile_photo — moderation
--
-- Admin-only, and separate from the owner path because it answers a different
-- question: not "I changed my mind" but "this image should not be on a public
-- roster". It clears the column and writes its event; the storage object is
-- deleted by the caller, because plpgsql cannot reach the storage API and
-- deleting the `storage.objects` row alone would leave the file behind.
-- =============================================================================

create function public.remove_profile_photo(p_player_id uuid)
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

  select photo_path into v_path from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Nothing to remove: no write, and no event. Moderating an
  -- already-removed photo is idempotent, and an event log that records
  -- non-events is one nobody can count.
  if v_path is null then
    return null;
  end if;

  update public.players set photo_path = null where id = p_player_id;

  v_actor := public.current_player_id();
  insert into public.events (event_type, player_id, metadata)
  values ('profile_photo_removed', p_player_id,
          jsonb_build_object('by_player_id', v_actor, 'path', v_path));

  -- The path the caller must now delete from the bucket. Null means there was
  -- nothing to remove, which is not an error — moderating an already-removed
  -- photo should be idempotent.
  return v_path;
end $$;

revoke execute on function public.remove_profile_photo(uuid) from public, anon;
grant execute on function public.remove_profile_photo(uuid) to authenticated;

comment on function public.remove_profile_photo(uuid) is
  'Admin-only moderation. Clears photo_path, emits profile_photo_removed, and '
  'returns the path the caller must delete from the bucket.';

-- =============================================================================
-- anonymize_player — deletion, as v2.5 §8 defines it
--
-- HAD NO IMPLEMENTATION UNTIL NOW. v2.5 §8 defines account deletion as
-- anonymization and Phase 1 performed it by hand on request. Phase 2 §4 adds a
-- requirement that cannot be met by hand — the storage object has to go too —
-- so the rule finally gets code, and the code returns the path so the caller
-- can finish the job in the bucket.
--
-- The row SURVIVES, with its PII replaced. `events` and `credit_ledger` stay
-- keyed to it: a hard delete would orphan the ledger, and the ledger is what
-- the wallet's integrity rests on. Anonymizing is what lets someone disappear
-- from the product without the accounting disappearing with them.
-- =============================================================================

create function public.anonymize_player(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  select photo_path into v_path from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  update public.players
  -- 'deleted-' + 8 hex = 16 characters, inside the 20-character
  -- players_nickname_format CHECK. The obvious 'deleted-player-<8>' is 23 and
  -- is rejected by that constraint — which is the constraint doing its job, and
  -- worth recording so nobody lengthens it back.
  set nickname = 'deleted-' || left(replace(p_player_id::text, '-', ''), 8),
      email = null,
      phone = null,
      photo_path = null,
      country = null,
      -- Consent evidence goes with the person: keeping "accepted v1.0 on this
      -- date" attached to an anonymized row records a fact about someone the
      -- row no longer identifies.
      tos_accepted_at = null,
      tos_version = null,
      marketing_opt_in = false
  where id = p_player_id;

  insert into public.events (event_type, player_id, metadata)
  values ('player_anonymized', p_player_id,
          jsonb_build_object('by_player_id', public.current_player_id()));

  return v_path;
end $$;

revoke execute on function public.anonymize_player(uuid) from public, anon;
grant execute on function public.anonymize_player(uuid) to authenticated;

comment on function public.anonymize_player(uuid) is
  'Admin-only. v2.5 §8 anonymization plus the Phase 2 photo rule: nulls PII, '
  'keeps the row so events and credit_ledger stay keyed to it, and returns the '
  'storage path the caller must delete.';
