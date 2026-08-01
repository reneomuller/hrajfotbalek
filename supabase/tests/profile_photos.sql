-- =============================================================================
-- Migration 24 assertions — the profile-photos bucket and its three RPCs
--
-- Run:  node supabase/tests/run.mjs profile_photos
--
-- Transaction-wrapped and rolled back. `call()` consumes the value it selects.
--
-- STORAGE IS THE POINT OF THIS SUITE. It is a policy surface nothing else in
-- this repo touches, the bucket is public-read, and the object key is what
-- carries ownership — so "can a player write over somebody else's avatar" is a
-- question about a LIKE predicate, and the only way to know the answer is to
-- try it as that player. Half these assertions are attempts that must fail.
-- =============================================================================

begin;

create temp table _results (
  seq serial primary key, label text, passed boolean, detail text
) on commit drop;

create function pg_temp.ok(cond boolean, label text, detail text default '')
returns void language plpgsql security definer as $$
begin
  insert into _results (label, passed, detail) values (label, cond, detail);
end $$;

create function pg_temp.call(sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'select (' || sql || ')::text' into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then return 'denied';
  when check_violation then return 'check_violation';
  when others then
    if sqlstate = 'P0001' then return 'raise:' || split_part(sqlerrm, ':', 1); end if;
    return 'error:' || sqlstate;
end $$;

create function pg_temp.do_stmt(sql text)
returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception
  when insufficient_privilege then return 'denied';
  when check_violation then return 'check_violation';
  when others then return 'error:' || sqlstate;
end $$;

create function pg_temp.ok_call(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.call(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.ok_do(sql text, expected text, label text)
returns void language plpgsql as $$
declare r text;
begin
  r := pg_temp.do_stmt(sql);
  perform pg_temp.ok(r = expected, label, r);
end $$;

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- --- fixtures ----------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000fb001'::uuid, 'ph-admin@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fb002'::uuid, 'ph-owner@test.invalid'),
  ('a0000000-0000-0000-0000-0000000fb003'::uuid, 'ph-other@test.invalid');

insert into public.players (id, nickname, email, auth_user_id, is_admin, country, skill_level,
                            tos_accepted_at, tos_version, phone) values
  ('bbbb0000-0000-0000-0000-0000000fb001'::uuid, 'PhAdmin', 'ph-admin@test.invalid',
   'a0000000-0000-0000-0000-0000000fb001'::uuid, true, null, null, null, null, null),
  ('bbbb0000-0000-0000-0000-0000000fb002'::uuid, 'PhOwner', 'ph-owner@test.invalid',
   'a0000000-0000-0000-0000-0000000fb002'::uuid, false, 'CZ', 'advanced',
   now(), '1.0', '+420600111222'),
  ('bbbb0000-0000-0000-0000-0000000fb003'::uuid, 'PhOther', 'ph-other@test.invalid',
   'a0000000-0000-0000-0000-0000000fb003'::uuid, false, null, null, null, null, null);

-- A ledger row, so anonymization can be shown NOT to take the accounting with it.
insert into public.credit_ledger (player_id, delta_czk, reason)
values ('bbbb0000-0000-0000-0000-0000000fb002'::uuid, 150, 'admin_grant');

-- =============================================================================
-- the bucket carries its own limits
--
-- The client crop is ergonomics; these three values are the enforcement, and a
-- migration that created the bucket without them would look identical until
-- somebody posted a 30 MB TIFF straight at the API.
-- =============================================================================

select pg_temp.ok(
  (select public from storage.buckets where id = 'profile-photos'),
  'the bucket is public-read');

select pg_temp.ok(
  (select file_size_limit from storage.buckets where id = 'profile-photos') = 2097152,
  'the 2 MiB limit is on the bucket, not only in the browser');

select pg_temp.ok(
  (select allowed_mime_types from storage.buckets where id = 'profile-photos')
    = array['image/jpeg', 'image/png', 'image/webp'],
  'only the three raster types are allowed');

-- SVG is a script container that browsers execute, and this bucket is public.
select pg_temp.ok(
  not ('image/svg+xml' = any (
    select unnest(allowed_mime_types) from storage.buckets where id = 'profile-photos')),
  'SVG is not an allowed image type');

-- =============================================================================
-- set_profile_photo — the owner, and only for themselves
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb002'::uuid);

select pg_temp.ok_call(
  $q$select public.set_profile_photo('webp')$q$,
  'players/bbbb0000-0000-0000-0000-0000000fb002.webp',
  'the path is derived from the caller''s own player id');

select pg_temp.ok_call(
  $q$select public.set_profile_photo('svg')$q$,
  'raise:UNSUPPORTED_IMAGE_TYPE',
  'an SVG extension is refused by the function too');

select pg_temp.ok_call(
  $q$select public.set_profile_photo('../../etc/passwd')$q$,
  'raise:UNSUPPORTED_IMAGE_TYPE',
  'a traversal string is not an extension');

reset role;

select pg_temp.ok(
  (select photo_path from public.players
   where id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid)
    = 'players/bbbb0000-0000-0000-0000-0000000fb002.webp',
  'the column was written, despite carrying no UPDATE grant');

-- There is no argument that could point one player's row at another's object:
-- the function takes an extension, not a path.
select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_profile_photo'
     and pg_get_function_identity_arguments(p.oid) = 'p_extension text') = 1,
  'set_profile_photo accepts an extension and nothing else');

set local role anon;
select pg_temp.ok_call(
  $q$select public.set_profile_photo('jpg')$q$,
  'denied',
  'anon holds no execute privilege on set_profile_photo');
reset role;

-- =============================================================================
-- the storage policies, tried as the wrong person
-- =============================================================================

-- The owner may write their own object.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb002'::uuid);
select pg_temp.ok_do(
  $q$insert into storage.objects (bucket_id, name)
     values ('profile-photos', 'players/bbbb0000-0000-0000-0000-0000000fb002.webp')$q$,
  'ok',
  'a player can write their own avatar object');

-- ...and may not write anybody else's, which is the whole reason the owner is
-- in the key rather than in a column the client could set.
select pg_temp.ok_do(
  $q$insert into storage.objects (bucket_id, name)
     values ('profile-photos', 'players/bbbb0000-0000-0000-0000-0000000fb003.webp')$q$,
  'denied',
  'a player cannot write over another player''s avatar');

select pg_temp.ok_do(
  $q$insert into storage.objects (bucket_id, name)
     values ('profile-photos', 'players/../secrets.webp')$q$,
  'denied',
  'a path outside the players/<id> shape is refused');

-- Deleting somebody else's object is refused at the privilege level rather
-- than silently matching nothing — a stronger result than the policy alone
-- would give, and worth asserting as the stronger one.
select pg_temp.ok_do(
  $q$delete from storage.objects
     where bucket_id = 'profile-photos'
       and name = 'players/bbbb0000-0000-0000-0000-0000000fb003.webp'$q$,
  'denied',
  'a player cannot delete another player''s avatar object');
reset role;

-- The other player's object, written as the suite's own role so the read test
-- below has something belonging to somebody else to look at.
insert into storage.objects (bucket_id, name)
values ('profile-photos', 'players/bbbb0000-0000-0000-0000-0000000fb003.webp');

-- Public read: avatars appear on public rosters, so this is deliberate.
set local role anon;
select pg_temp.ok(
  (select count(*) from storage.objects
   where bucket_id = 'profile-photos') >= 2,
  'an anonymous visitor can read avatar objects — the bucket is public by design');
reset role;

-- =============================================================================
-- remove_profile_photo — moderation, admin only
-- =============================================================================

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb003'::uuid);
select pg_temp.ok_call(
  $q$select public.remove_profile_photo('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot remove somebody else''s photo');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb002'::uuid);
select pg_temp.ok_call(
  $q$select public.remove_profile_photo('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a player cannot even moderate their own — this is not the owner''s path');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb001'::uuid);
select pg_temp.ok_call(
  $q$select public.remove_profile_photo('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'players/bbbb0000-0000-0000-0000-0000000fb002.webp',
  'an admin gets back the path they must delete from the bucket');

-- Idempotent: moderating an already-removed photo is not an error.
select pg_temp.ok_call(
  $q$select public.remove_profile_photo('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'null',
  'removing an already-removed photo returns null rather than raising');

-- ...and writes nothing. An event log that records non-events cannot be counted.

select pg_temp.ok_call(
  $q$select public.remove_profile_photo('99990000-0000-0000-0000-00000000dead'::uuid)$q$,
  'raise:PLAYER_NOT_FOUND',
  'removing a photo from a player who does not exist is refused');
reset role;

select pg_temp.ok(
  (select photo_path from public.players
   where id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid) is null,
  'the column is cleared');

select pg_temp.ok(
  (select count(*) from public.events
   where event_type = 'profile_photo_removed'
     and player_id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid
     and metadata->>'by_player_id' = 'bbbb0000-0000-0000-0000-0000000fb001') = 1,
  'the removal is recorded with the admin who did it');

-- =============================================================================
-- anonymize_player — v2.5 §8, finally in code
-- =============================================================================

-- Give the photo back so anonymization has one to return.
select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb002'::uuid);
select pg_temp.ok_call($q$select public.set_profile_photo('jpg')$q$,
  'players/bbbb0000-0000-0000-0000-0000000fb002.jpg',
  'the owner can set a photo again after moderation');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb003'::uuid);
select pg_temp.ok_call(
  $q$select public.anonymize_player('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'raise:INSUFFICIENT_PERMISSION',
  'a non-admin cannot anonymize anyone');
reset role;

select pg_temp.act_as('a0000000-0000-0000-0000-0000000fb001'::uuid);
select pg_temp.ok_call(
  $q$select public.anonymize_player('bbbb0000-0000-0000-0000-0000000fb002'::uuid)$q$,
  'players/bbbb0000-0000-0000-0000-0000000fb002.jpg',
  'anonymization returns the storage path the caller must delete');
reset role;

select pg_temp.ok(
  (select count(*) from public.players
   where id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid
     and email is null and phone is null and photo_path is null
     and country is null and tos_accepted_at is null and tos_version is null
     and not marketing_opt_in
     and nickname like 'deleted-%'
     and length(nickname) <= 20) = 1,
  'PII is nulled, and the placeholder nickname fits the 20-character CHECK');

-- The row survives, and so does the accounting keyed to it. A hard delete would
-- orphan the ledger, which is what the wallet's integrity rests on.
select pg_temp.ok(
  (select count(*) from public.players
   where id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid) = 1,
  'the player row is retained rather than deleted');

select pg_temp.ok(
  (select coalesce(sum(delta_czk), 0) from public.credit_ledger
   where player_id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid) = 150,
  'the credit ledger is untouched and still keyed to the row');

select pg_temp.ok(
  (select count(*) from public.events
   where player_id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid) >= 2,
  'the event history is retained, including the anonymization itself');

select pg_temp.ok(
  (select count(*) from public.events
   where event_type = 'player_anonymized'
     and player_id = 'bbbb0000-0000-0000-0000-0000000fb002'::uuid) = 1,
  'anonymization writes its own event — the largest state change is not silent');

-- =============================================================================
-- results
-- =============================================================================

select seq, label, case when passed then 'PASS' else 'FAIL' end as result, detail
from _results order by seq;

select
  count(*) as total,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed,
  case when count(*) filter (where not passed) = 0
       then 'ALL PASS' else 'HAS FAILURES' end as summary
from _results;

rollback;
