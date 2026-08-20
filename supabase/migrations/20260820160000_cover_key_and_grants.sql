-- =============================================================================
-- Two corrections to round 8's migrations (round 9, item 1)
--
-- Both were found by verifying the features end to end against a real database
-- rather than by reading the code, which is the only way either could have
-- been found: each one leaves the surface looking like it works.
--
-- -----------------------------------------------------------------------------
-- 1. THE COVER KEY NEVER MATCHED ITS OWN STORAGE POLICY
--
-- `set_cover_photo` derived `players/<id>-cover.<ext>`, and migration 21's
-- policies match `players/' || p.id::text || '.%'` — a literal DOT straight
-- after the id. `<id>-cover.webp` puts `-cover` BEFORE that dot, so the LIKE
-- never matched and every upload was refused with "new row violates
-- row-level security policy".
--
-- The failure is quiet in the worst way: `set_cover_photo` had already written
-- `players.cover_path`, so the row said the player had a cover and the object
-- was never stored. The page then renders an <img> at a 404, which reads as a
-- broken photograph rather than as a permissions error.
--
-- THE FIX IS THE KEY, NOT THE POLICY. `players/<id>.cover.<ext>` sits inside
-- the existing pattern — after the id comes a dot, and `cover.webp` is the
-- `%`. That makes round 8's claim ("the cover key is inside the prefix those
-- policies already admit") TRUE rather than aspirational, and it leaves the
-- four storage policies untouched. Rewriting them to admit a second shape
-- would mean four rewrites that have to stay equivalent to the originals,
-- which is the kind of change that quietly is not.
--
-- The avatar's own key (`players/<id>.<ext>`) cannot collide with it: one has
-- exactly one dot after the id, the other has two.
--
-- DATA: production holds no cover rows and no cover objects (verified before
-- writing this). The one local test row is cleared below, so no key in either
-- database is left pointing at an object that can never exist.
--
-- -----------------------------------------------------------------------------
-- 2. `service_role` COULD NOT READ THE NOTIFICATION TABLES
--
-- Migration 20260820120000 granted SELECT to `authenticated` and stopped
-- there. Every other table in this schema is readable by the service role,
-- which is what every admin query in `lib/admin/queries.ts` uses — so
-- `notifications` was the one table an admin surface could not read, and the
-- error is a bare 42501 rather than an empty result.
--
-- Nothing in the product is broken by it today: the bell and the compose form
-- both go through SECURITY DEFINER RPCs that own the tables. This closes the
-- inconsistency before something depends on it.
--
-- NO WRITE GRANT, deliberately. The rule stands: both writes stay inside their
-- RPCs, and a service-role INSERT here would be a way around the admin check
-- inside `admin_create_notification`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The cover key
-- -----------------------------------------------------------------------------

create or replace function public.set_cover_photo(p_extension text)
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

  -- `<id>.cover.<ext>`, NOT `<id>-cover.<ext>`. The dot immediately after the
  -- id is what migration 21's storage policies match on; see the header.
  v_path := 'players/' || v_player_id::text || '.cover.' || p_extension;

  update public.players set cover_path = v_path where id = v_player_id;

  return v_path;
end $$;

comment on function public.set_cover_photo(text) is
  'Owner-only. Derives players/<own id>.cover.<ext> and records it; never '
  'accepts a path from the caller. The key shape is load-bearing: migration '
  '21''s storage policies match players/<id>.% and nothing else.';

-- Any row written under the old shape points at an object that was never
-- stored, so it must go back to null rather than be rewritten to a key with
-- nothing behind it. Idempotent, and matches nothing on production.
update public.players
   set cover_path = null
 where cover_path like '%-cover.%';

-- -----------------------------------------------------------------------------
-- 2. The notification grants
-- -----------------------------------------------------------------------------

grant select on public.notifications           to service_role;
grant select on public.user_notification_reads to service_role;
