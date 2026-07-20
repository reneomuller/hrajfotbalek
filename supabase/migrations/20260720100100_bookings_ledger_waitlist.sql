-- =============================================================================
-- Migration 2 — bookings, credit_ledger, waitlist, VS sequence,
--               game_roster_public view (+ deny-by-default RLS)
--
-- Completes the schema so the Phase 5-7 RPCs have every table, constraint,
-- sequence and view to target. Still pure schema: no state transitions here.
--
-- Two structures carry disproportionate weight:
--
--   1. `bookings_one_active_per_player_per_game` — the partial unique index is
--      the last-line backstop against double-booking even if the advisory-lock
--      logic in `create_booking` is ever wrong. It is a backstop, not the
--      primary mechanism.
--
--   2. `game_roster_public` — the ONLY anonymous read path into booking data,
--      and therefore the single highest-risk PII surface in the system. It is
--      SECURITY DEFINER, so it bypasses the RLS that would otherwise have
--      constrained it. Its projection and its game-status filter are the only
--      things standing between an anonymous visitor and the roster. There is
--      no second line of defence behind this view.
--
-- Rollback: supabase/rollback/20260720100100_bookings_ledger_waitlist_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.booking_status as enum (
  'reserved',
  'confirmed',
  'cancelled',
  'expired'
);

-- `credit` and `seed_free` are OUTCOMES the booking RPCs derive, never values a
-- caller may assert. `create_booking` / `admin_create_booking` accept only
-- 'qr' | 'cash' from clients and reject the other two outright (Phase 5).
create type public.payment_method as enum (
  'qr',
  'cash',
  'credit',
  'seed_free'
);

create type public.attendance_status as enum (
  'present',
  'no_show'
);

create type public.credit_reason as enum (
  'cancellation_credit',
  'admin_grant',
  'redemption',
  'adjustment'
);

-- -----------------------------------------------------------------------------
-- Variable-symbol sequence
--
-- Renders as a '26' prefix plus an 8-digit zero-padded counter, e.g. 2600000001.
-- Numbers are NEVER reused: a variable symbol is the permanent identifier of a
-- payment, and reuse would make bank reconciliation ambiguous. `no cycle` makes
-- exhaustion an error rather than a silent wraparound into reissued symbols.
-- -----------------------------------------------------------------------------

create sequence public.booking_payment_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 99999999
  no cycle;

create function public.next_payment_code()
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  select ('26' || lpad(nextval('public.booking_payment_code_seq')::text, 8, '0'))::bigint;
$$;

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.booking_status not null default 'reserved',
  payment_method public.payment_method not null,

  -- Numeric variable symbol. QR bookings only; null for cash, credit and
  -- seed_free. Unique across all time — see the sequence comment above.
  payment_code bigint unique,

  -- Locked at booking time: a later change to games.price_czk must not
  -- retroactively alter what an existing booking owes.
  price_czk integer not null,
  credit_applied_czk integer not null default 0,

  is_seed boolean not null default false,
  booked_by_admin boolean not null default false,

  -- null until the game is settled; then 'present' or 'no_show'.
  attendance public.attendance_status,

  -- Idempotency guards for the Phase 20 cron sweeps. Not optional: without
  -- them a re-run of a sweep re-notifies every player it already notified.
  nudge_sent_at timestamptz,
  reminder_sent_at timestamptz,

  -- An unpaid reservation holds until game day by DEFAULT: this stays null
  -- until the booking has been nudged, at which point the expiry sweep sets it.
  expires_at timestamptz,

  -- Hours between cancellation and kickoff, recorded at cancel time.
  cancel_lead_hours numeric(6, 2),

  created_at timestamptz not null default now(),

  constraint bookings_price_non_negative check (price_czk >= 0),
  constraint bookings_credit_applied_non_negative check (credit_applied_czk >= 0),
  constraint bookings_credit_applied_within_price check (credit_applied_czk <= price_czk),

  -- Only QR bookings carry a variable symbol.
  constraint bookings_payment_code_qr_only check (
    (payment_method = 'qr') or (payment_code is null)
  )
);

-- One active booking per player per game. The backstop behind the advisory
-- locks: a second reserved/confirmed row for the same pair cannot exist, while
-- rebooking after a cancellation or expiry remains possible.
create unique index bookings_one_active_per_player_per_game
  on public.bookings (game_id, player_id)
  where status in ('reserved', 'confirmed');

-- Phase 19 expiry sweep.
create index bookings_status_expires_at_idx on public.bookings (status, expires_at);

-- Phase 22 VS-sorted pending-payment list.
create index bookings_game_id_payment_code_idx on public.bookings (game_id, payment_code);

create index bookings_player_id_idx on public.bookings (player_id);

-- Migration 1 created events.booking_id without a foreign key because
-- `bookings` did not exist yet. Close that loop now.
alter table public.events
  add constraint events_booking_id_fkey
  foreign key (booking_id) references public.bookings (id) on delete set null;

-- -----------------------------------------------------------------------------
-- credit_ledger
--
-- Append-only by privilege, not merely by convention. A player's balance is
-- SUM(delta_czk) over their rows; if any actor can UPDATE or DELETE a row, the
-- balance is no longer a derivable fact.
--
-- Non-negativity is deliberately NOT a table constraint: a per-row CHECK cannot
-- express a cross-row sum invariant. The guard lives in `create_booking`
-- (Phase 5), which re-reads the balance under the per-player advisory lock and
-- raises CREDIT_NEGATIVE_BLOCKED rather than writing a redemption that would
-- drive the sum below zero.
-- -----------------------------------------------------------------------------

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,

  -- Negative for redemptions, positive for grants and cancellation credit.
  delta_czk integer not null,
  reason public.credit_reason not null,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint credit_ledger_delta_non_zero check (delta_czk <> 0)
);

create index credit_ledger_player_id_idx on public.credit_ledger (player_id);
create index credit_ledger_booking_id_idx on public.credit_ledger (booking_id);

-- -----------------------------------------------------------------------------
-- waitlist
-- -----------------------------------------------------------------------------

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),

  -- Records the LAST notification time. Explicitly NOT a suppression flag:
  -- when a second spot opens, everyone still waiting is notified again.
  notified_at timestamptz,

  converted_booking_id uuid references public.bookings (id) on delete set null,

  constraint waitlist_one_entry_per_player_per_game unique (game_id, player_id)
);

create index waitlist_game_id_joined_at_idx on public.waitlist (game_id, joined_at);
create index waitlist_player_id_idx on public.waitlist (player_id);

-- =============================================================================
-- Row Level Security — enabled in the same migration that creates each table
-- =============================================================================

alter table public.bookings      enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.waitlist      enable row level security;

revoke all on public.bookings      from anon, authenticated;
revoke all on public.credit_ledger from anon, authenticated;
revoke all on public.waitlist      from anon, authenticated;

-- Own-row READS only. No client INSERT, UPDATE or DELETE is granted on any of
-- these tables: every write goes through a SECURITY DEFINER RPC that performs
-- its own authorization check and writes the state row, the ledger row and the
-- event row in one transaction.

-- --- bookings ----------------------------------------------------------------

create policy bookings_select_own
  on public.bookings
  for select
  to authenticated
  using (
    player_id in (
      select p.id from public.players p
      where p.auth_user_id = (select auth.uid())
    )
  );

grant select on public.bookings to authenticated;

-- --- credit_ledger -----------------------------------------------------------

create policy credit_ledger_select_own
  on public.credit_ledger
  for select
  to authenticated
  using (
    player_id in (
      select p.id from public.players p
      where p.auth_user_id = (select auth.uid())
    )
  );

grant select on public.credit_ledger to authenticated;

-- Append-only, enforced by privilege. Stated explicitly even though the blanket
-- REVOKE above already covers it: this is the invariant the wallet rests on,
-- and an explicit REVOKE survives someone later granting the table wholesale.
revoke update, delete on public.credit_ledger from anon, authenticated;

-- --- waitlist ----------------------------------------------------------------

create policy waitlist_select_own
  on public.waitlist
  for select
  to authenticated
  using (
    player_id in (
      select p.id from public.players p
      where p.auth_user_id = (select auth.uid())
    )
  );

grant select on public.waitlist to authenticated;

-- =============================================================================
-- game_roster_public — the only anonymous read path into booking data
-- =============================================================================
--
-- Projects EXACTLY game_id, nickname and booking status. It must never expose
-- player_id, email or phone.
--
-- `security_invoker = false` makes this a SECURITY DEFINER view: it runs with
-- the owner's privileges and therefore bypasses the row-owner RLS on
-- `bookings` and `players`, which is the whole point — an anonymous visitor has
-- no session and owns no rows, but still needs to see who is playing.
--
-- Because it bypasses RLS, the game-status filter MUST live in the view body.
-- The `games` RLS policy that hides draft games does not apply here. Leaking a
-- draft game's roster would expose who is booked on a game that policy
-- deliberately hides; a cancelled game has no roster worth showing. Only the
-- four public statuses project rows.
--
-- Only active bookings appear: a cancelled or expired booking is not a spot in
-- the lineup.

create view public.game_roster_public
with (security_invoker = false) as
  select
    b.game_id,
    p.nickname,
    b.status
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

revoke all on public.game_roster_public from anon, authenticated;
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface. Projects only game_id, nickname and booking status. '
  'SECURITY DEFINER by design; the game-status filter in the view body is the '
  'sole enforcement point and must not be removed.';
