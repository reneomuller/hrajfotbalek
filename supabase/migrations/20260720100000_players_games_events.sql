-- =============================================================================
-- Migration 1 — players, games, events (+ deny-by-default RLS)
--
-- The identity and event-log spine. Pure schema: no functions are defined here.
--
-- Conventions established by this migration and honoured by every later one:
--   * RLS is enabled in the SAME migration that creates each table, never as a
--     follow-up. A table that exists for even one deploy without RLS is a leak.
--   * Privileges are revoked first and granted back explicitly. This project's
--     Supabase instance has "automatically expose new tables" DISABLED and
--     automatic RLS ENABLED, so a table with no explicit GRANT returns an empty
--     result set to PostgREST rather than an error — silent, and easy to
--     misread as "RLS is working". Every read the spec permits is granted here
--     on purpose.
--   * Player-facing UPDATE is granted per-column, never table-wide. `is_admin`
--     is deliberately excluded: it is grantable only from the Supabase
--     dashboard, so there must be no in-app elevation path.
--
-- Rollback: supabase/rollback/20260720100000_players_games_events_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.game_status as enum (
  'draft',
  'published',
  'full',
  'played',
  'settled',
  'cancelled'
);

-- -----------------------------------------------------------------------------
-- players
--
-- A durable player identity decoupled from auth. `auth_user_id` is nullable:
-- null means a "shadow" player, created by an admin for someone who has never
-- logged in (the WhatsApp-era roster). The row is later claimed on exact email
-- match at first magic-link sign-in, which is what lets historical bookings
-- survive the migration to self-service.
-- -----------------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text,
  phone text,
  auth_user_id uuid references auth.users (id) on delete set null,
  is_admin boolean not null default false,
  is_seed boolean not null default false,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),

  -- Mirrors the app-side nickname regex exactly. Free text that reaches a
  -- render site is HTML-escaped downstream; this constraint keeps the stored
  -- value narrow in the first place.
  constraint players_nickname_format check (nickname ~ '^[A-Za-z0-9 _-]{1,20}$')
);

-- Unique where present. Partial indexes, not UNIQUE constraints, because
-- multiple email-less shadow players must be able to coexist.
create unique index players_nickname_key on public.players (lower(nickname));
create unique index players_email_key on public.players (lower(email)) where email is not null;
create unique index players_auth_user_id_key on public.players (auth_user_id) where auth_user_id is not null;

-- -----------------------------------------------------------------------------
-- games
-- -----------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  venue text not null,
  starts_at timestamptz not null,
  capacity integer not null,
  price_czk integer not null,
  status public.game_status not null default 'draft',
  city text not null default 'prague',
  brand text not null default 'hrajfotbal',
  created_at timestamptz not null default now(),

  constraint games_capacity_positive check (capacity > 0),
  constraint games_price_non_negative check (price_czk >= 0)
);

create index games_starts_at_idx on public.games (starts_at);
create index games_status_starts_at_idx on public.games (status, starts_at);

-- -----------------------------------------------------------------------------
-- events — append-only log
--
-- Every notable action writes a row here, stamped with city/brand and the
-- playbook/policy versions in force at the time. Phase 26's stats surface is
-- computed entirely from this table, so future metrics are SQL queries rather
-- than new projects.
--
-- `booking_id` is intentionally an unconstrained uuid in this migration —
-- `bookings` does not exist yet. Migration 2 adds the foreign key.
-- -----------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  player_id uuid references public.players (id) on delete set null,
  game_id uuid references public.games (id) on delete set null,
  booking_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  city text not null default 'prague',
  brand text not null default 'hrajfotbal',
  playbook_version text not null default 'v1',
  policy_version text not null default 'v1',
  created_at timestamptz not null default now(),

  -- The full Phase 1 catalog — 22 event types.
  constraint events_event_type_catalog check (
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
      -- waitlist
      'waitlist_joined',
      'waitlist_notified',
      'waitlist_converted',
      -- lifecycle sweeps
      'nudge_sent',
      'reminder_sent',
      -- settlement
      'attendance_marked'
    )
  )
);

-- Phase 26's stats queries are aggregates over (event_type, created_at).
create index events_event_type_created_at_idx on public.events (event_type, created_at);
create index events_player_id_idx on public.events (player_id);
create index events_game_id_idx on public.events (game_id);
create index events_booking_id_idx on public.events (booking_id);

-- =============================================================================
-- Row Level Security — enabled in the same migration that creates each table
-- =============================================================================

alter table public.players enable row level security;
alter table public.games   enable row level security;
alter table public.events  enable row level security;

-- Belt and suspenders: strip everything, then grant back only what the spec
-- permits. Nothing is inherited by accident.
revoke all on public.players from anon, authenticated;
revoke all on public.games   from anon, authenticated;
revoke all on public.events  from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- --- players -----------------------------------------------------------------
-- Own row only. This table holds PII (email, phone) and has no public read.

create policy players_select_own
  on public.players
  for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

create policy players_update_own
  on public.players
  for update
  to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

grant select on public.players to authenticated;

-- Column-scoped UPDATE. `is_admin`, `is_seed`, `email` and `auth_user_id` are
-- deliberately NOT grantable: an RLS policy cannot restrict which columns an
-- UPDATE touches, so without this a player could flip their own `is_admin`
-- while still satisfying the own-row USING clause.
grant update (nickname, phone, marketing_opt_in) on public.players to authenticated;

-- --- games -------------------------------------------------------------------
-- Publicly visible games are readable by anyone, signed in or not.
--
-- Note on scope: the phase prompt says "published games anonymously readable".
-- The policy admits the four PUBLIC statuses — published, full, played,
-- settled — rather than `published` alone, matching the same four-status
-- definition of "public" that migration 2's `game_roster_public` view uses.
-- Admitting only `published` would hide a full game from the games list while
-- its roster stayed publicly readable through the view, which is incoherent.
-- `draft` and `cancelled` remain invisible, which is what the acceptance
-- criterion asserts.

create policy games_select_public
  on public.games
  for select
  to anon, authenticated
  using (status in ('published', 'full', 'played', 'settled'));

grant select on public.games to anon, authenticated;

-- --- events ------------------------------------------------------------------
-- No client access whatsoever: no policies, no grants. Reachable only by the
-- SECURITY DEFINER RPCs and the service role. RLS is enabled so that even a
-- future accidental GRANT still denies by default.

-- (intentionally no policies and no grants on public.events)
