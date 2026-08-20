-- =============================================================================
-- Profile cover photo (round 8, item 10)
--
-- The player's own banner, changed exactly the way the avatar is: same bucket,
-- same key shape, same owner-only policies, same "the database derives the
-- path" rule. The item asks for parity, and parity here means reusing the
-- mechanism rather than building a second one beside it.
--
-- ONE NEW COLUMN AND TWO RPCs, and nothing else. The `profile-photos` bucket,
-- its 2 MiB limit, its MIME allow-list and its four storage policies all
-- already cover this: the policies match on `players/<own id>.%`, and the
-- cover key is `players/<own id>-cover.<ext>`, which that LIKE pattern already
-- admits. A second bucket would mean a second set of policies to keep in step
-- for no property the first one lacks.
--
-- WHY THE KEY IS A SUFFIX AND NOT A FOLDER. `players/<id>-cover.webp` sits
-- inside the same prefix the existing policies match, so no policy changes.
-- `covers/<id>.webp` would need all four rewritten, and a rewrite that has to
-- stay equivalent to the original is the kind of change that quietly is not.
--
-- NO DEFAULT AND NULLABLE: an unset cover renders the R6 pitch photograph,
-- which is what every profile shows today. Nothing backfills.
-- =============================================================================

alter table public.players add column cover_path text;

comment on column public.players.cover_path is
  'Object key of the player''s own cover photo in `profile-photos`, or null to '
  'use the default pitch image. Written only by set_cover_photo/clear_cover_photo.';

-- No UPDATE grant is added. `players` has none on this table for clients
-- (migration 21) and this column inherits that: the two functions below are the
-- only ways in, exactly as `photo_path` works.

-- =============================================================================
-- set_cover_photo — the owner records their own path
--
-- Mirrors `set_profile_photo` line for line, including deriving the key rather
-- than accepting one: a caller who can pass a path can point their row at
-- somebody else's object, which is the hole the derived key closes.
-- =============================================================================

create function public.set_cover_photo(p_extension text)
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

  v_path := 'players/' || v_player_id::text || '-cover.' || p_extension;

  update public.players set cover_path = v_path where id = v_player_id;

  return v_path;
end $$;

revoke execute on function public.set_cover_photo(text) from public, anon;
grant execute on function public.set_cover_photo(text) to authenticated;

comment on function public.set_cover_photo(text) is
  'Owner-only. Derives players/<own id>-cover.<ext> and records it; never '
  'accepts a path from the caller.';

-- =============================================================================
-- clear_cover_photo — back to the default pitch image
-- =============================================================================

create function public.clear_cover_photo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  -- The row only. The OBJECT is left in the bucket deliberately: the storage
  -- policies let the owner delete it and the next upload overwrites the same
  -- key, so a delete here would be a second failure mode (row cleared, object
  -- delete refused) for no benefit the upsert does not already provide.
  update public.players set cover_path = null where id = v_player_id;
end $$;

revoke execute on function public.clear_cover_photo() from public, anon;
grant execute on function public.clear_cover_photo() to authenticated;
