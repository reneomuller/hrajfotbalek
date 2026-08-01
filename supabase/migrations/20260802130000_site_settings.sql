-- =============================================================================
-- Migration 30 — site_settings
--
-- Contract §6. A single row of admin-editable content that the HOME PAGE
-- renders for signed-out visitors: the active-player number in the stats strip
-- and in the community heading, and the Player of the Month.
--
-- THE GRANT IS THE POINT OF THIS MIGRATION, and it is stated explicitly rather
-- than assumed. Supabase's auto-expose is off and auto-RLS is on here, so a
-- table created without a GRANT returns EMPTY to `anon` rather than erroring —
-- which on this surface reads as "the stats strip has no content yet" instead
-- of "the stats strip cannot be read". That is the single most repeated lesson
-- in this project (CLAUDE.md), and this is the table where it would be least
-- visible: an empty strip looks like a content problem, not a permissions one.
--
-- ONE ROW, ENFORCED. `id` is a CHECK-pinned constant rather than a convention,
-- because "there is only one row" maintained by hand is a second row waiting
-- for a tired afternoon — and every reader here does `where id = 'singleton'`
-- with no ordering, so a second row would silently win or lose at random.
--
-- JSONB VALUES rather than a column per setting. The set of settings will grow
-- (§6 already names two, and Player of the Month is a player reference while
-- the active count is a number), and each new one being a migration is how a
-- content field ends up hardcoded instead. The RPC validates per key.
--
-- Rollback: supabase/rollback/20260802130000_site_settings_down.sql
-- =============================================================================

create table public.site_settings (
  id text primary key default 'singleton',
  /**
   * Admin-editable content, keyed. Known keys:
   *   active_players       — integer, the community-size number (§6)
   *   player_of_month      — uuid of a player, or null
   */
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.players (id) on delete set null,

  constraint site_settings_singleton check (id = 'singleton'),
  constraint site_settings_object check (jsonb_typeof(settings) = 'object')
);

insert into public.site_settings (id, settings) values ('singleton', '{}'::jsonb);

-- =============================================================================
-- RLS — readable by everyone, writable by nobody through the client
-- =============================================================================

alter table public.site_settings enable row level security;

create policy site_settings_select_public
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

-- EXPLICIT, and verified by an anonymous read in the suite rather than assumed.
-- Both the stats strip and Player of the Month render for signed-out visitors.
grant select on public.site_settings to anon, authenticated;
grant select, update on public.site_settings to service_role;

-- No INSERT, UPDATE or DELETE policy for `anon` or `authenticated`, and no
-- grant either: the RPC below is the only writer. Belt and braces, because a
-- policy without a grant and a grant without a policy each fail differently
-- and neither failure is loud.

comment on table public.site_settings is
  'Single row of admin-editable home-page content. Readable by anon — the '
  'stats strip and Player of the Month render for signed-out visitors, and '
  'without the explicit grant those reads return empty rather than erroring. '
  'Written only through set_site_setting.';

-- =============================================================================
-- The event type — WIDENED IN THE SAME MIGRATION THAT EMITS IT
--
-- `events_event_type_catalog` is one CHECK listing every permitted type, and a
-- migration that emits a new one without widening it fails at the first WRITE
-- rather than at the migration — naming a constraint that has nothing to do
-- with the feature. That has already happened once (migration 24 added the
-- photo events and omitted the top-up ones, so the first `create_topup` failed
-- on the catalog).
--
-- Postgres cannot extend a CHECK in place, so this is drop + re-add with the
-- list restated IN FULL. That is pre-approved (contract §1, signed off
-- 2026-08-01) while the new list is a strict superset — it is here: one type
-- added, nothing removed, and the window in which the constraint is absent is
-- inside this transaction.
-- =============================================================================

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
    -- top-ups (migration 25)
    'topup_requested',
    'topup_confirmed',
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
    'player_anonymized',
    -- site content (migration 30)
    'site_setting_changed'
  )
);

-- =============================================================================
-- set_site_setting — admin only, one key at a time, and it says who
-- =============================================================================

create function public.set_site_setting(p_key text, p_value jsonb)
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
  -- the failure nobody notices — the strip just looks empty again.
  if p_key not in ('active_players', 'player_of_month') then
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
   * The first is a silently broken stats strip; the second is the "clear the
   * pick" button failing with a message about a player nobody named. Both were
   * found by the E2E spec, not by the SQL suite — which had passed
   * `'null'::jsonb` directly and therefore never took this path.
   */
  v_value := coalesce(p_value, 'null'::jsonb);

  -- Per-key validation, because the two are different kinds of thing and a
  -- jsonb column will happily store either as the other.
  if p_key = 'active_players' then
    if jsonb_typeof(v_value) <> 'number' or (v_value)::text ~ '\.' then
      raise exception 'SETTING_VALUE_INVALID' using detail = 'active_players must be a whole number';
    end if;
    if (v_value)::text::numeric < 0 then
      raise exception 'SETTING_VALUE_INVALID' using detail = 'active_players cannot be negative';
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
  -- number on a public page that nobody can account for — and this one is a
  -- claim about the size of the community.
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

comment on function public.set_site_setting(text, jsonb) is
  'Admin-only write of one site setting. Closed key set, per-key validation, '
  'and an event naming the admin and the new value — a public number with no '
  'audit trail is one nobody can account for.';
