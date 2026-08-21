-- =============================================================================
-- Round 13 item 18 — contact details the owner edits without a deploy
--
-- The footer's Contact control did nothing. It now opens a dialog listing the
-- addresses and numbers people can actually reach — and those live in
-- `site_settings`, so changing them is a form in `/admin`, not a commit.
--
-- NO NEW TABLE. Migration 30 built a singleton jsonb store precisely for
-- "small facts the owner edits", and `set_site_setting` already carries the
-- admin check, the closed key set and the null-collapsing that took two
-- attempts to get right. Two additional keys is the whole change.
--
-- THE KEY SET STAYS CLOSED, which is why this is a migration rather than a
-- config edit. An open key set means `settings` slowly accumulates misspelled
-- keys that render as an absent value, which is the failure nobody notices.
--
-- SHAPES:
--   contact_emails  jsonb array of strings, one or more
--   contact_phones  jsonb array of strings, none or more
--
-- An empty phone list is a REAL STATE and renders no phone at all — the item
-- says so, and it is the honest default for a product whose organizer may not
-- want to publish a number.
--
-- Rollback: supabase/rollback/20260821220000_contact_settings_down.sql
-- =============================================================================

create or replace function public.set_site_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_value jsonb;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_key is null or btrim(p_key) = '' then
    raise exception 'SETTING_KEY_REQUIRED';
  end if;

  -- A CLOSED SET OF KEYS. An open one means `settings` slowly accumulates
  -- misspelled keys that render as an absent value on the home page, which is
  -- the failure nobody notices — the panel just looks empty again.
  -- A CLOSED SET OF KEYS, widened in round 13 item 18 by exactly two.
  if p_key not in ('active_players', 'games_per_week', 'player_of_month',
                   'contact_emails', 'contact_phones') then
    raise exception 'SETTING_KEY_UNKNOWN' using detail = p_key;
  end if;

  /*
   * SQL NULL AND JSON null MEAN THE SAME THING HERE, and collapsing them is
   * not tidiness — it is the difference between the admin form working and
   * not.
   *
   * PostgREST marshals a JavaScript `null` argument as SQL NULL, never as the
   * jsonb value `'null'`. Every comparison below against SQL NULL evaluates to
   * NULL, which plpgsql treats as false — so an unguarded version accepts a
   * NULL `active_players` and stores it, and refuses a NULL `player_of_month`
   * with PLAYER_NOT_FOUND because `(NULL #>> '{}')::uuid` matches no row.
   *
   * The first is a silently broken number; the second is the "clear the pick"
   * button failing with a message about a player nobody named. Both were found
   * by the E2E spec, not by the SQL suite — which had passed `'null'::jsonb`
   * directly and therefore never took this path.
   */
  v_value := coalesce(p_value, 'null'::jsonb);

  /*
   * Per-key validation, because these are different kinds of thing and a jsonb
   * column will happily store either as the other.
   *
   * THE TWO INTEGER KEYS SHARE ONE BRANCH rather than getting one apiece. They
   * are the same rule — a whole number, not negative — and two copies of it is
   * how `games_per_week` ends up accepting 7.5 a year from now because only one
   * of them was fixed.
   */
  if p_key in ('active_players', 'games_per_week') then
    if jsonb_typeof(v_value) <> 'number' or (v_value)::text ~ '\.' then
      raise exception 'SETTING_VALUE_INVALID' using detail = p_key || ' must be a whole number';
    end if;
    if (v_value)::text::numeric < 0 then
      raise exception 'SETTING_VALUE_INVALID' using detail = p_key || ' cannot be negative';
    end if;
  end if;

  if p_key = 'player_of_month' then
    -- Null clears the pick, which is a real thing an admin does between months.
    if jsonb_typeof(v_value) = 'null' then
      null;
    elsif jsonb_typeof(v_value) <> 'string' then
      raise exception 'SETTING_VALUE_INVALID' using detail = 'player_of_month must be a player id or null';
    elsif not exists (
      select 1 from public.players where id = (v_value #>> '{}')::uuid
    ) then
      raise exception 'PLAYER_NOT_FOUND';
    end if;
  end if;

  /*
   * THE TWO CONTACT LISTS (round 13, item 18) — an ARRAY OF STRINGS.
   *
   * VALIDATED HERE RATHER THAN IN THE FORM, because the form is a route guard
   * and a route guard is skipped by anyone using curl — and this value is
   * rendered to every visitor of the site. A non-array, or an array of
   * objects, reaches the footer's dialog as `[object Object]` inside a
   * `mailto:`.
   *
   * EMPTY IS ALLOWED AND MEANS "SHOW NONE". That is the phone list's normal
   * state; treating empty as an error would make "remove my number" an
   * operation the form could not express. Which list may be empty in the
   * RENDER is `getContactDetails`'s decision, not the store's.
   */
  if p_key in ('contact_emails', 'contact_phones') then
    if jsonb_typeof(v_value) <> 'null' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'SETTING_VALUE_INVALID' using detail = p_key || ' must be an array';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_value) e
         where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = ''
      ) then
        raise exception 'SETTING_VALUE_INVALID'
          using detail = p_key || ' must contain non-empty strings';
      end if;
      -- A bound, so a paste accident cannot turn the dialog into a document.
      if jsonb_array_length(v_value) > 10 then
        raise exception 'SETTING_VALUE_INVALID' using detail = p_key || ' holds at most 10 entries';
      end if;
    end if;
  end if;

  select p.id into v_admin
    from public.players p
   where p.auth_user_id = auth.uid();

  update public.site_settings
     set settings = settings || jsonb_build_object(p_key, v_value),
         updated_at = now(),
         updated_by = v_admin
   where id = 'singleton';

  -- WHO CHANGED IT, AND TO WHAT. A settings change with no audit trail is a
  -- number on a public page that nobody can account for — and both of these are
  -- claims the organizer is making about the size of the thing they run.
  insert into public.events (event_type, player_id, metadata, policy_version)
  values (
    'site_setting_changed',
    v_admin,
    jsonb_build_object('key', p_key, 'value', v_value),
    'v1'
  );
end $$;

-- Grants restated: `create or replace` preserves them, and a reader should not
-- have to check whether replacing the body reopened PUBLIC execute.
revoke execute on function public.set_site_setting(text, jsonb) from public, anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated, service_role;

/*
 * VERIFIED WITHOUT CALLING IT, on purpose, for two reasons: the migration runs
 * as the owner, who is neither `is_admin_caller()` nor `is_service_role()` and
 * would be refused by the function's own first line — and a self-test that
 * called it would WRITE the owner's live contact details, which is not
 * something a migration should do to prove a branch exists.
 */
do $$
declare v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_site_setting';

  if v_src is null then
    raise exception 'contact settings: set_site_setting is missing';
  end if;

  if v_src not like '%contact_emails%' or v_src not like '%contact_phones%' then
    raise exception 'contact settings: the key set was not widened';
  end if;

  -- And the three it already had are still in it. A `create or replace` that
  -- dropped one would break the home page's numbers silently.
  if v_src not like '%active_players%'
     or v_src not like '%games_per_week%'
     or v_src not like '%player_of_month%' then
    raise exception 'contact settings: the widened list lost an existing key';
  end if;
end $$;
