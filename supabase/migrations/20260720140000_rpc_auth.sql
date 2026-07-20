-- =============================================================================
-- Migration 8 — auth RPCs: link-sent, completed, shadow claim, signup
--
-- `events` has no client grants at all, so the auth funnel cannot write to it
-- from a route handler. Reaching for the service-role client instead would
-- work, but it would be a direct RLS-bypassing table write — the exact thing
-- the "all writes through RPCs" rule exists to prevent, and the events table's
-- whole design depends on there being no such backdoor. So these are
-- SECURITY DEFINER functions like every other writer in the schema.
--
-- Rollback: supabase/rollback/20260720140000_rpc_auth_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- record_auth_link_sent
--
-- Callable by ANON: the whole point is that the caller has not signed in yet.
--
-- KNOWN, ACCEPTED RISK for Phase 1: an anonymous caller can therefore write
-- auth_link_sent rows in a loop and inflate the drop-off denominator. It
-- cannot read them back (events has no read grant), cannot touch any other
-- table, and the row carries no PII — the email is deliberately NOT recorded.
-- The mitigation is edge rate limiting, which is not in Phase 1 scope. Noted
-- here rather than discovered later.
-- -----------------------------------------------------------------------------

create function public.record_auth_link_sent(
  p_game_id uuid default null,
  p_action  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_city text := 'prague'; v_brand text := 'hrajfotbal';
begin
  if p_action is not null and p_action not in ('book', 'join_waitlist', 'login') then
    raise exception 'INVALID_PENDING_ACTION';
  end if;

  if p_game_id is not null then
    select g.city, g.brand into v_city, v_brand from public.games g where g.id = p_game_id;
  end if;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('auth_link_sent', p_game_id,
          jsonb_build_object('pending_action', p_action),
          coalesce(v_city, 'prague'), coalesce(v_brand, 'hrajfotbal'));
end;
$$;

revoke execute on function public.record_auth_link_sent(uuid, text) from public;
grant execute on function public.record_auth_link_sent(uuid, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- record_auth_completed
--
-- The auth_link_sent -> auth_completed pair is the magic-link drop-off funnel
-- Phase 26 reports on. Returns whether the session already has a player row,
-- so the callback knows whether to route to signup.
-- -----------------------------------------------------------------------------

create function public.record_auth_completed()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no session';
  end if;

  v_player_id := public.current_player_id();

  insert into public.events (event_type, player_id, metadata)
  values ('auth_completed', v_player_id,
          jsonb_build_object('had_player_row', v_player_id is not null));

  return v_player_id is not null;
end;
$$;

revoke execute on function public.record_auth_completed() from public;
grant execute on function public.record_auth_completed() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- claim_shadow_player — EXACT EMAIL MATCH ONLY
--
-- An admin may have created a player row months ago for someone who booked via
-- WhatsApp. When that person finally signs in, their history must attach to the
-- existing row rather than fork into a duplicate.
--
-- The matching rule is exact-or-nothing. Fuzzy matching here would silently
-- bind one person's booking history to another person's account, which is
-- unrecoverable in practice and invisible when it happens. Case is normalised
-- (both sides lowered) because email casing is not semantically meaningful and
-- the players_email_key index is already on lower(email) — so "exact" means
-- exact modulo case, consistently with the uniqueness constraint.
--
-- A shadow player with a NULL email can never be auto-claimed by any login.
-- It is claimable only through the Phase 25 admin merge tool.
-- -----------------------------------------------------------------------------

create function public.claim_shadow_player()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid;
  v_email    text;
  v_existing uuid;
  v_shadow   public.players%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no session';
  end if;

  -- Already linked: nothing to do, and definitely nothing to create.
  select p.id into v_existing from public.players p where p.auth_user_id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null or length(trim(v_email)) = 0 then
    return null;
  end if;

  -- Only an UNCLAIMED row is eligible. `auth_user_id is null` is what makes it
  -- a shadow; a row already bound to another account is never re-bound here.
  select * into v_shadow
    from public.players p
   where p.auth_user_id is null
     and p.email is not null
     and lower(p.email) = lower(v_email)
   limit 1;

  if not found then
    return null;
  end if;

  update public.players set auth_user_id = v_uid where id = v_shadow.id;

  insert into public.events (event_type, player_id, metadata)
  values ('player_claimed', v_shadow.id,
          jsonb_build_object('match', 'exact_email', 'was_shadow', true));

  return v_shadow.id;
end;
$$;

revoke execute on function public.claim_shadow_player() from public;
grant execute on function public.claim_shadow_player() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- complete_signup — first-time account creation
-- -----------------------------------------------------------------------------

create function public.complete_signup(
  p_nickname          text,
  p_gdpr_consent      boolean,
  p_marketing_opt_in  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_email     text;
  v_player_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no session';
  end if;

  select p.id into v_player_id from public.players p where p.auth_user_id = v_uid;
  if v_player_id is not null then
    return v_player_id;
  end if;

  -- GDPR consent is REQUIRED and is a separate control from marketing opt-in.
  -- Bundling them would make consent non-specific, which is precisely what
  -- makes it invalid.
  if p_gdpr_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  -- Mirrors the app-side regex and the players_nickname_format CHECK. Checked
  -- here so the caller gets a named error rather than a raw constraint
  -- violation surfacing in the UI.
  if p_nickname is null or p_nickname !~ '^[A-Za-z0-9 _-]{1,20}$' then
    raise exception 'NICKNAME_INVALID';
  end if;

  if exists (select 1 from public.players p where lower(p.nickname) = lower(p_nickname)) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  begin
    insert into public.players (nickname, email, auth_user_id, marketing_opt_in)
    values (p_nickname, v_email, v_uid, coalesce(p_marketing_opt_in, false))
    returning id into v_player_id;
  exception
    -- Lost a race against a concurrent signup taking the same nickname.
    when unique_violation then
      raise exception 'NICKNAME_TAKEN';
  end;

  insert into public.events (event_type, player_id, metadata)
  values ('account_created', v_player_id,
          jsonb_build_object('marketing_opt_in', coalesce(p_marketing_opt_in, false)));

  return v_player_id;
end;
$$;

revoke execute on function public.complete_signup(text, boolean, boolean) from public;
grant execute on function public.complete_signup(text, boolean, boolean) to authenticated, service_role;
