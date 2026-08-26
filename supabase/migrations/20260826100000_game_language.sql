-- =============================================================================
-- Round 18 — the language a game is played in, and a format CHECK that has
-- been one migration behind production for three weeks
--
-- TWO CHANGES IN ONE FILE because they are one apply, and the second is a
-- BUG FIX the owner reported as "6v6v6 does not show on the card". It does not
-- show because it was never saved: production's `games_format_format` still
-- reads `^[0-9]{1,2}v[0-9]{1,2}$`, the two-way-only version, because
-- `20260802180000_format_three_way.sql` was never applied there. Local has the
-- three-way form; production does not. That is exactly the class CLAUDE.md
-- records — "when a UI failure looks inexplicable and the code reads
-- correctly, check this list before debugging the component".
--
-- AND THREE GROUPS IS STILL NOT ENOUGH. The owner also asked for `7v7v7v7`,
-- which the three-way regex refuses as well — so this widens it rather than
-- merely catching production up. Capped at FOUR groups rather than left
-- unbounded: the value is rendered as-is in a chip on a public page, and
-- `6v6v6v6v6v6v6v6` is a chip that eats the card. Four covers every shape
-- anybody runs on one pitch.
--
-- -----------------------------------------------------------------------------
-- THE LANGUAGE COLUMN
--
-- TWO VALUES, NOT A LOCALE. `en-cs` and `uk-ru` are PAIRS — the two languages
-- you will hear on the pitch — and they are deliberately not `lib/i18n`'s
-- locales, which are the three the interface is translated into. A game is not
-- "in Czech"; it is a game where Czech and English get you by, or one where
-- Ukrainian and Russian do. Reusing the locale type would have made a game's
-- language look assignable from a cookie.
--
-- NOT NULL WITH A DEFAULT, so every existing game is `en-cs` — which is what
-- they have all been. A nullable column would mean a third state, "unknown",
-- that no surface could render and every reader would have to decide about.
--
-- Rollback: supabase/rollback/20260826100000_game_language_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Format: catch production up AND widen to four groups
-- -----------------------------------------------------------------------------
alter table public.games drop constraint games_format_format;

alter table public.games add constraint games_format_format check (
  format is null or format ~ '^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2}){0,2}$'
);

comment on column public.games.format is
  'The organizer''s words for the shape of the game: 6v6, 6v6v6 for a rotating '
  'three-way, 7v7v7v7 for a four-way. Constrained rather than free text because '
  'it is rendered as-is in a chip on a public page, and capped at four groups '
  'for the same reason. Mirrored by FORMAT_RE in lib/admin/gameForm.ts.';

-- -----------------------------------------------------------------------------
-- 2. The language column
-- -----------------------------------------------------------------------------
alter table public.games
  add column if not exists language text not null default 'en-cs';

alter table public.games drop constraint if exists games_language_catalog;

alter table public.games add constraint games_language_catalog check (
  language in ('en-cs', 'uk-ru')
);

comment on column public.games.language is
  'Which pair of languages this game is run in: en-cs (English/Czech) or '
  'uk-ru (Ukrainian/Russian). A property of the GAME, not of the reader — '
  'unrelated to the interface locale in lib/i18n. Drives the flag pill on the '
  'card and which messaging app the organizer contact offers.';

-- -----------------------------------------------------------------------------
-- 3. The write path
--
-- `admin_create_game_v2` and `admin_update_game` are the only writers. Rather
-- than restate either function in full — which is how round 13 silently
-- changed three unrelated branches of `set_site_setting` — the language is set
-- by its OWN small function, called by the admin action after the game is
-- created or updated.
--
-- IT IS NOT A SECOND SOURCE OF TRUTH. There is one column and one function
-- that writes it; the game RPCs never touch it, so they cannot disagree.
-- -----------------------------------------------------------------------------
create or replace function public.set_game_language(
  p_game_id  uuid,
  p_language text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  if p_language is null or p_language not in ('en-cs', 'uk-ru') then
    raise exception 'INVALID_LANGUAGE' using detail = coalesce(p_language, '<null>');
  end if;

  update public.games set language = p_language where id = p_game_id;

  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
end
$$;

revoke execute on function public.set_game_language(uuid, text) from public;
grant execute on function public.set_game_language(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. The capability flag
--
-- Same shape as round 16's: the application asks what this database can do and
-- hides the control when the answer is no. Restated in full because
-- `create or replace` needs the whole body — and the round-16 flags are
-- repeated here EXACTLY, so applying this cannot switch any of them off.
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — same transaction as the migration.
--
-- IT EXERCISES THE CHECKS rather than reading them out of the catalog. A
-- constraint whose text mentions a value and a constraint that accepts it are
-- different things when the pattern was typed by hand — which is the whole
-- reason `7v7v7v7` was refused while a regex that "allows three-way" sat in
-- the repo.
-- -----------------------------------------------------------------------------
do $ver$
declare
  v_venue uuid;
  v_game  uuid;
  v_caps  jsonb;
begin
  select id into v_venue from public.venues limit 1;

  if v_venue is null then
    raise notice 'no venue to exercise the CHECKs against — constraints created';
  else
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, format, language)
    values ('__migration probe__', v_venue, now() + interval '400 days', 10, 150, '7v7v7v7', 'uk-ru')
    returning id into v_game;

    -- Every shape the product now claims to accept.
    update public.games set format = '6v6'     where id = v_game;
    update public.games set format = '6v6v6'   where id = v_game;
    update public.games set format = '7v7v7v7' where id = v_game;

    -- And one it must not.
    begin
      update public.games set format = '6v6v6v6v6' where id = v_game;
      raise exception 'games_format_format accepted five groups';
    exception
      when check_violation then null;
    end;

    begin
      update public.games set language = 'de-fr' where id = v_game;
      raise exception 'games_language_catalog accepted an unknown pair';
    exception
      when check_violation then null;
    end;

    delete from public.games where id = v_game;
  end if;

  if (select count(*)::int from public.games where language is null) > 0 then
    raise exception 'games.language is nullable or backfilled with nulls';
  end if;

  select public.app_capabilities() into v_caps;
  if (v_caps ->> 'gameLanguage') is distinct from 'true'
     or (v_caps ->> 'adminDelete') is distinct from 'true' then
    raise exception 'app_capabilities lost a flag: %', v_caps;
  end if;

  raise notice 'round 18 verified: format to four groups, language column, capability on';
end
$ver$;
