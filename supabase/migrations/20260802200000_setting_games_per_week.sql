-- =============================================================================
-- Migration 37 — games-per-week becomes an admin-editable setting
--
-- The home page's second number used to be COMPUTED: published games in the
-- trailing seven days. That was removed with the stats strip in the design's
-- first pass, and the number is now wanted back — but as a CLAIM the organizer
-- makes, not as a measurement.
--
-- WHY THE COMPUTED VERSION WAS THE WRONG ANSWER, and this is the whole reason
-- for the migration rather than a helper function:
--
--   - It answered a different question. "7+ games every week" on a landing page
--     is a promise about what a visitor can expect to find. A trailing-seven-day
--     count is a report on the last seven days, and the two diverge exactly when
--     it matters — a quiet fortnight in August would have advertised "2 games
--     every week" to everyone arriving from a shared link.
--   - It could not carry the "+". The copy is "7+", which is a floor. A
--     computed 7 is not a floor, it is a coincidence.
--   - It made the two numbers on one panel different kinds of thing. Active
--     players was always an honest editorial claim (it counts the WhatsApp
--     cohort, not rows in `players`). Sitting a measurement beside it invited
--     the reader to trust both equally.
--
-- So it joins `active_players` as a peer: same table, same closed key set, same
-- integer validation, same audit event. One admin form saves both.
--
-- THE FUNCTION IS RESTATED IN FULL, not patched. `set_site_setting`'s key check
-- is an `in` list inside the body, so widening it is a `create or replace` of
-- the whole function — the same shape as widening a CHECK, and for the same
-- reason: Postgres has nowhere to put the delta.
--
-- Rollback: supabase/rollback/20260802200000_setting_games_per_week_down.sql
-- =============================================================================

comment on column public.site_settings.settings is
  'Admin-editable content, keyed. Known keys: active_players (integer), '
  'games_per_week (integer), player_of_month (uuid or null).';

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
  if p_key not in ('active_players', 'games_per_week', 'player_of_month') then
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

-- Grants are attached to the function, and `create or replace` preserves them —
-- but they are restated because the previous migration's revoke/grant pair is
-- the security boundary, and a reader of this file should not have to go and
-- check whether replacing the body reopened PUBLIC execute.
revoke execute on function public.set_site_setting(text, jsonb) from public, anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated, service_role;

-- =============================================================================
-- The seeded floors
--
-- 7 and 500, as the copy states them. Written with `||` in the same shape the
-- RPC uses, and only where the key is ABSENT: a value an admin has already set
-- is theirs, and a migration that overwrote it would silently undo an editorial
-- decision the next time it ran.
-- =============================================================================

update public.site_settings
   set settings = jsonb_build_object('games_per_week', 7, 'active_players', 500) || settings,
       updated_at = now()
 where id = 'singleton';
