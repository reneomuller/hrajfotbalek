-- =============================================================================
-- Migration 25 — credit_topups, its VS series, and the two RPCs
--
-- Phase 2 §4/§4.1. The first surface in this product where a player puts money
-- IN rather than spending it, and the first ledger writer that is not a
-- consequence of a booking.
--
-- WHY A TABLE AND NOT A BOOKING. `bookings.payment_code` is unique and
-- CHECK-constrained to `payment_method = 'qr'`, so a top-up cannot borrow that
-- row even if the shape were otherwise similar — and it is not similar: a
-- booking holds a spot and expires, a top-up holds nothing and never expires.
--
-- WHY A SEPARATE VS SERIES. Booking VS is `26` + 8 digits. Top-ups take `27`,
-- so a bank statement distinguishes "paid for Tuesday" from "put 300 in the
-- wallet" at a glance, and the admin reconciling them does not have to open the
-- app to find out which is which. Both stay inside the Czech 10-digit limit.
--
-- RECONCILIATION IS DELIBERATELY SIMPLER THAN A BOOKING'S. v2.5 §4 has three
-- rules for a booking payment because a booking has a PRICE, so a payment can
-- be short of it or over it. A top-up has no price: the player chose a number
-- and the bank reports what actually arrived. **The credited amount is always
-- the amount received.** There is no overpayment case and no underpayment case,
-- because there is nothing to be over or under.
--
-- Rollback: supabase/rollback/20260801110000_credit_topups_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- the event catalog gains the two top-up types
--
-- Contract §4 named `topup_requested` and `topup_confirmed` from the start, and
-- migration 24 widened the catalog for the photo events without carrying these
-- — so the first `create_topup` call failed on the CHECK rather than on
-- anything to do with top-ups. Worth naming: the catalog is a single constraint
-- that every migration adding an event has to remember, and forgetting it fails
-- at the write rather than at the migration.
-- -----------------------------------------------------------------------------

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
    -- wallet top-ups (migration 25)
    'topup_requested',
    'topup_confirmed'
  )
);

-- -----------------------------------------------------------------------------
-- the '27' variable-symbol series
--
-- Same shape as `next_payment_code()` (migration 2), same reasoning: a sequence
-- rather than a random number, because a VS must never be reused and a gap is
-- harmless. SECURITY INVOKER and revoked from clients — a caller who could mint
-- variable symbols could mint them for somebody else's top-up.
-- -----------------------------------------------------------------------------

create sequence public.topup_payment_code_seq
  as bigint
  start with 1
  increment by 1
  no cycle;

create function public.next_topup_code()
returns bigint
language sql
volatile
set search_path = ''
as $$
  select ('27' || lpad(nextval('public.topup_payment_code_seq')::text, 8, '0'))::bigint;
$$;

revoke execute on function public.next_topup_code() from public, anon, authenticated;

comment on function public.next_topup_code() is
  'Top-up variable symbols: 27 + 8 digits. Distinct series from booking VS (26) '
  'so a bank statement tells the two apart. Never reused.';

-- -----------------------------------------------------------------------------
-- credit_topups
-- -----------------------------------------------------------------------------

create type public.topup_status as enum ('pending', 'confirmed', 'cancelled');

create table public.credit_topups (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,

  -- What the player asked for. After confirmation this is a record of intent,
  -- not of money: `received_amount_czk` is what actually arrived.
  amount_czk integer not null,

  payment_code bigint not null unique,
  status public.topup_status not null default 'pending',

  received_amount_czk integer,
  confirmed_by uuid references public.players (id) on delete set null,
  confirmed_at timestamptz,

  city text not null default 'prague',
  brand text not null default 'hrajfotbal',
  policy_version text not null default 'v1',
  created_at timestamptz not null default now(),

  -- Bounds enforced here as well as in the RPC. The RPC gives a named error to
  -- a person; this makes the range true of the table regardless of who writes.
  constraint credit_topups_amount_range check (amount_czk between 50 and 2000),
  constraint credit_topups_received_positive check (
    received_amount_czk is null or received_amount_czk > 0
  ),
  -- A confirmed row must carry its confirmation, and a pending one must not.
  constraint credit_topups_confirmation_paired check (
    (status = 'confirmed') = (confirmed_at is not null)
  )
);

create index credit_topups_player_idx on public.credit_topups (player_id, created_at desc);
create index credit_topups_pending_idx on public.credit_topups (status, payment_code)
  where status = 'pending';

-- =============================================================================
-- RLS — deny by default, owner reads own rows, NOBODY writes from a client
-- =============================================================================

alter table public.credit_topups enable row level security;

revoke all on public.credit_topups from anon, authenticated;

create policy credit_topups_select_own
  on public.credit_topups
  for select
  to authenticated
  using (player_id = public.current_player_id());

grant select on public.credit_topups to authenticated;

-- No INSERT/UPDATE/DELETE grant of any kind: both writers below are
-- SECURITY DEFINER and authorize inside themselves (v2.5 §3).
grant select on public.credit_topups to service_role;

comment on table public.credit_topups is
  'Player-initiated wallet top-ups. Pending rows are NOT balance: the balance '
  'is SUM(credit_ledger.delta_czk), and a pending top-up writes no ledger row.';

-- =============================================================================
-- create_topup — owner only
-- =============================================================================

create function public.create_topup(p_amount_czk integer)
returns public.credit_topups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_row       public.credit_topups;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  -- Identity comes from the session and there is no player argument, so there
  -- is nothing to pass that would create a top-up against someone else.
  if p_amount_czk is null or p_amount_czk < 50 or p_amount_czk > 2000 then
    raise exception 'AMOUNT_OUT_OF_RANGE'
      using detail = 'top-ups are between 50 and 2000 CZK';
  end if;

  insert into public.credit_topups (player_id, amount_czk, payment_code)
  values (v_player_id, p_amount_czk, public.next_topup_code())
  returning * into v_row;

  insert into public.events (event_type, player_id, metadata)
  values ('topup_requested', v_player_id,
          jsonb_build_object(
            'topup_id', v_row.id,
            'amount_czk', p_amount_czk,
            'payment_code', v_row.payment_code));

  return v_row;
end $$;

revoke execute on function public.create_topup(integer) from public, anon;
grant execute on function public.create_topup(integer) to authenticated;

comment on function public.create_topup(integer) is
  'Owner-only. Draws a 27-series VS, inserts a pending top-up and emits '
  'topup_requested. No player argument: identity is the session.';

-- =============================================================================
-- confirm_topup — admin or service role, mirroring confirm_booking
--
-- The signature is deliberately the same shape as `confirm_booking`: a null
-- received amount means "the amount asked for", and a supplied one is what the
-- bank actually reported. That is the parameter a future Fio poller populates,
-- and keeping the two functions parallel is what makes one poller able to drive
-- both without a special case.
-- =============================================================================

create type public.topup_result as (
  id uuid,
  status public.topup_status,
  credited_czk integer,
  balance_czk integer
);

create function public.confirm_topup(
  p_topup_id            uuid,
  p_confirmed_by        uuid default null,
  p_received_amount_czk integer default null
)
returns public.topup_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup    public.credit_topups;
  v_actor    uuid;
  v_credited integer;
  v_balance  integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin or service role only';
  end if;

  -- Serialize per player, exactly as create_booking does before touching the
  -- wallet: two admins confirming two top-ups for one player at the same
  -- instant must not interleave their balance reads.
  select * into v_topup from public.credit_topups where id = p_topup_id;
  if not found then
    raise exception 'TOPUP_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_topup.player_id::text, 0));

  -- Re-read under the lock: the row may have been confirmed between the select
  -- above and the lock being granted.
  select * into v_topup from public.credit_topups where id = p_topup_id;

  if v_topup.status <> 'pending' then
    raise exception 'TOPUP_NOT_PENDING'
      using detail = 'this top-up is ' || v_topup.status::text;
  end if;

  -- The whole reconciliation rule, in one line: what arrived is what is
  -- credited. Null means the admin is confirming at the amount asked for.
  v_credited := coalesce(p_received_amount_czk, v_topup.amount_czk);
  if v_credited <= 0 then
    raise exception 'AMOUNT_OUT_OF_RANGE' using detail = 'credited amount must be positive';
  end if;

  v_actor := coalesce(p_confirmed_by, public.current_player_id());

  update public.credit_topups
  set status = 'confirmed',
      received_amount_czk = v_credited,
      confirmed_by = v_actor,
      confirmed_at = now()
  where id = p_topup_id;

  -- Ledger, status and event in ONE transaction. A credited top-up whose ledger
  -- row is missing is money the player paid and cannot spend.
  insert into public.credit_ledger (player_id, delta_czk, reason)
  values (v_topup.player_id, v_credited, 'topup');

  insert into public.events (event_type, player_id, metadata)
  values ('topup_confirmed', v_topup.player_id,
          jsonb_build_object(
            'topup_id', v_topup.id,
            'requested_czk', v_topup.amount_czk,
            'credited_czk', v_credited,
            'payment_code', v_topup.payment_code,
            'confirmed_by', v_actor));

  select coalesce(sum(delta_czk), 0) into v_balance
  from public.credit_ledger where player_id = v_topup.player_id;

  return (v_topup.id, 'confirmed'::public.topup_status, v_credited, v_balance);
end $$;

revoke execute on function public.confirm_topup(uuid, uuid, integer) from public, anon;
grant execute on function public.confirm_topup(uuid, uuid, integer) to authenticated, service_role;

comment on function public.confirm_topup(uuid, uuid, integer) is
  'Admin-or-service-role. Credits the amount RECEIVED (null = the amount asked '
  'for), writes ledger + status + event in one transaction under a per-player '
  'advisory lock, and returns the new balance.';
