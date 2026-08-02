-- Rollback for migration 37 — games-per-week stops being a setting.
--
-- The stored value is removed as well as the key being un-widened. Leaving it
-- behind would be a value no writer can reach and no reader looks at, which is
-- exactly the kind of orphan that gets rediscovered later and trusted.

update public.site_settings
   set settings = settings - 'games_per_week',
       updated_at = now()
 where id = 'singleton';

comment on column public.site_settings.settings is
  'Admin-editable content, keyed. Known keys: active_players (integer), '
  'player_of_month (uuid or null).';

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

  if p_key not in ('active_players', 'player_of_month') then
    raise exception 'SETTING_KEY_UNKNOWN' using detail = p_key;
  end if;

  v_value := coalesce(p_value, 'null'::jsonb);

  if p_key = 'active_players' then
    if jsonb_typeof(v_value) <> 'number' or (v_value)::text ~ '\.' then
      raise exception 'SETTING_VALUE_INVALID' using detail = 'active_players must be a whole number';
    end if;
    if (v_value)::text::numeric < 0 then
      raise exception 'SETTING_VALUE_INVALID' using detail = 'active_players cannot be negative';
    end if;
  end if;

  if p_key = 'player_of_month' then
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

  insert into public.events (event_type, player_id, metadata, policy_version)
  values (
    'site_setting_changed',
    v_admin,
    jsonb_build_object('key', p_key, 'value', v_value),
    'v1'
  );
end $$;

revoke execute on function public.set_site_setting(text, jsonb) from public, anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated, service_role;
