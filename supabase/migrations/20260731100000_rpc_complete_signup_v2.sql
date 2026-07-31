-- =============================================================================
-- Migration 23 — complete_signup_v2
--
-- Phase 2 §3.1. Writes the player row with the profile fields the new signup
-- form collects: country, skill level and the TOS stamp, alongside the nickname
-- and consents `complete_signup` already handled.
--
-- WHY A NEW FUNCTION RATHER THAN A CHANGED ONE. Postgres cannot
-- `create or replace` a function into a different parameter list — that is a
-- `drop` plus a `create`, and Phase 2 §1 forbids a destructive migration
-- without a human gate sign-off naming it. `complete_signup` therefore stays
-- exactly where it is, unused, until a later gated migration removes it. The
-- alternative — writing the profile in a second statement after the original
-- function returns — would have split account creation across two transactions,
-- which is the one thing v2.5 §3 exists to prevent. An orphaned function is a
-- smaller cost than a signup that can half-succeed.
--
-- TWO CONSENTS, NOT ONE. `p_gdpr_consent` survives from v1 and
-- `p_tos_accepted` joins it, both required, deliberately separate. v2.5 §8
-- requires a GDPR consent checkbox and Phase 2 §3.1 requires a TOS checkbox;
-- Phase 2 supersedes where it speaks and it does not speak about removing the
-- first. They are also different things: agreeing to the rules of a booking
-- service is not the same act as consenting to the processing of personal data,
-- and v1's own comment already records why bundling them would make the consent
-- non-specific and therefore invalid. The form shows two boxes.
--
-- WHAT IT DOES NOT DO. It does not claim a shadow player — `claim_shadow_player`
-- runs earlier, in the shared post-auth path, and this function is only reached
-- when no player row exists for the session. It does not create the auth user
-- either: `signUp()` has already done that, which is what makes `auth.uid()`
-- available here.
--
-- Rollback: supabase/rollback/20260731100000_rpc_complete_signup_v2_down.sql
-- =============================================================================

create function public.complete_signup_v2(
  p_nickname          text,
  p_gdpr_consent      boolean,
  p_tos_accepted      boolean,
  p_tos_version       text,
  p_country           text,
  p_skill_level       public.skill_level,
  p_marketing_opt_in  boolean default false,
  p_phone             text default null
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
  v_country   text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no session';
  end if;

  -- Idempotent for a session that already completed signup. A second submit —
  -- a double tap, a retried request, a back button — returns the existing row
  -- rather than colliding on the auth_user_id unique constraint and surfacing a
  -- raw error to someone who has already succeeded.
  select p.id into v_player_id from public.players p where p.auth_user_id = v_uid;
  if v_player_id is not null then
    return v_player_id;
  end if;

  -- Consents first: nothing else is worth validating if the person did not
  -- agree to be here. Separate checks, separate errors — see the header.
  if p_gdpr_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  if p_tos_accepted is not true then
    raise exception 'TOS_REQUIRED';
  end if;

  if p_tos_version is null or btrim(p_tos_version) = '' then
    raise exception 'TOS_VERSION_REQUIRED'
      using detail = 'the caller must state which revision of the terms was shown';
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

  -- ISO 3166-1 alpha-2. Upper-cased rather than rejected for case: a form that
  -- refuses "cz" teaches the user nothing, and the storage shape is what the
  -- column CHECK cares about. Anything that is not two letters is a real error.
  v_country := upper(btrim(coalesce(p_country, '')));
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'COUNTRY_INVALID';
  end if;

  if p_skill_level is null then
    raise exception 'SKILL_REQUIRED';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  begin
    insert into public.players (
      nickname, email, phone, auth_user_id, marketing_opt_in,
      country, skill_level, tos_accepted_at, tos_version
    )
    values (
      p_nickname, v_email, nullif(btrim(coalesce(p_phone, '')), ''), v_uid,
      coalesce(p_marketing_opt_in, false),
      v_country, p_skill_level, now(), p_tos_version
    )
    returning id into v_player_id;
  exception
    -- Lost a race against a concurrent signup taking the same nickname.
    when unique_violation then
      raise exception 'NICKNAME_TAKEN';
  end;

  -- Same event as v1, with the profile facts that are worth counting later.
  -- The country and skill of a cohort are the first questions asked of a
  -- signup funnel, and an event log that omitted them would need a join to a
  -- table whose values the player can change afterwards.
  insert into public.events (event_type, player_id, metadata)
  values ('account_created', v_player_id,
          jsonb_build_object(
            'marketing_opt_in', coalesce(p_marketing_opt_in, false),
            'country', v_country,
            'skill_level', p_skill_level,
            'tos_version', p_tos_version,
            'signup_version', 'v2'));

  return v_player_id;
end $$;

revoke execute on function public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text) from public;
revoke execute on function public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text) from anon;
grant execute on function public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text) to authenticated;

-- `service_role` is granted deliberately, matching v1: the seed script creates
-- fixture players through a real session, and an admin-side repair path may
-- need it. Authorization still comes from auth.uid() inside the function, so
-- the grant confers reach, not permission — a service-role call with no session
-- is refused by the first check.
grant execute on function public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text) to service_role;

comment on function public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text) is
  'Phase 2 signup. Writes the player row, both consents and the profile fields '
  'with account_created in one transaction. Supersedes complete_signup, which '
  'remains only because dropping it needs a gated migration.';
