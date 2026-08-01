-- =============================================================================
-- Migration 32 — the game-pass substrate
--
-- Contract §4.2, substrate RATIFIED 2026-08-01. A pass is discounted wallet
-- credit with an expiry date: not a separate currency, not a ticket, not a
-- counter of games. It buys CZK into the existing wallet at a discount, and
-- that CZK spends through the rails Phase 1 built.
--
-- THE ONE INVARIANT THIS MIGRATION EXISTS TO PROTECT:
--
--     BALANCE IS STILL SUM(delta_czk) OVER credit_ledger.
--
-- Every surface, every test and the whole wallet rests on that. The rejected
-- alternative was a balance function excluding expired remainders — always
-- correct, and it makes balance no longer equal the ledger sum, which means
-- finding and changing every reader of that sum midway through a live project.
-- The ruling accepted the cost of keeping it: a window between an expiry
-- instant and the next sweep in which expired credit is still spendable. That
-- window is at most the cron interval and errs in the player's favour.
--
-- A FUTURE SESSION TEMPTED TO "FIX" THAT WINDOW by filtering expired rows out
-- of a balance query would be re-opening the rejected option one caller at a
-- time. Don't. The sweep is the mechanism.
--
-- Rollback: supabase/rollback/20260802150000_pass_substrate_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TWO NULLABLE COLUMNS ON THE LEDGER, and a third for the heads-up.
--
-- Nullable so every existing row stays valid and unexpiring — which is what
-- those rows mean. A row is exactly one of three things:
--
--   BATCH ROW      expires_at not null, batch_id null
--                  the positive row a pass purchase writes
--   BATCH-LINKED   batch_id not null
--                  a redemption from, refund to, or expiry of that batch
--   ORDINARY       both null
--                  top-ups, admin grants, cancellation credits from cash/QR
--
-- That trichotomy is what makes "sum of every batch's remainder plus the
-- ordinary pool" equal SUM(delta_czk) exactly — i.e. what makes the allocator
-- able to spend precisely the balance and no more.
-- -----------------------------------------------------------------------------

alter table public.credit_ledger
  add column expires_at timestamptz,
  add column batch_id uuid references public.credit_ledger (id),
  add column expiry_notified_at timestamptz;

-- A batch row is positive by definition: an expiry on a negative row would be
-- an expiring debt, which is not a thing this product has.
alter table public.credit_ledger
  add constraint credit_ledger_batch_positive check (
    expires_at is null or delta_czk > 0
  );

-- A row cannot be both a batch and a draw against one.
alter table public.credit_ledger
  add constraint credit_ledger_batch_shape check (
    expires_at is null or batch_id is null
  );

create index credit_ledger_batch_idx on public.credit_ledger (batch_id)
  where batch_id is not null;

-- The allocator's ordering read, and the sweep's. Partial, because batches are
-- a small minority of ledger rows and will stay that way.
create index credit_ledger_expiry_idx
  on public.credit_ledger (player_id, expires_at)
  where expires_at is not null;

comment on column public.credit_ledger.expires_at is
  'Set on a positive BATCH row (a pass purchase). Null everywhere else, which '
  'is what "this credit does not expire" means. Balance is still '
  'SUM(delta_czk) — the sweep writes a compensating negative row rather than '
  'any reader filtering on this column.';
comment on column public.credit_ledger.batch_id is
  'On a redemption, refund or expiry row: the batch it draws from, returns to '
  'or closes. Null on batch rows and on ordinary credit.';
comment on column public.credit_ledger.expiry_notified_at is
  'Idempotency guard for the three-day heads-up, on the batch row. The same '
  'shape as bookings.nudge_sent_at, and for the same reason: a cron route that '
  'can send twice will.';

-- -----------------------------------------------------------------------------
-- The tiers (§4.2)
--
-- A TABLE RATHER THAN A CONSTANT, because three different things read them:
-- the pass page, the admin confirmation screen, and `confirm_topup`'s
-- exact-price match. One source means a price change cannot land in two of the
-- three.
--
-- Credited value is always games × 150 — stored rather than derived so the
-- table states the whole offer, and CHECKed so it cannot drift from the rule.
-- -----------------------------------------------------------------------------

create table public.pass_tiers (
  games integer primary key,
  price_czk integer not null,
  credited_czk integer not null,
  /** Null = never expires. Only the 1-game tier. */
  expires_months integer,

  constraint pass_tiers_games_positive check (games > 0),
  constraint pass_tiers_price_positive check (price_czk > 0),
  constraint pass_tiers_credited_rule check (credited_czk = games * 150),
  -- A tier may not cost MORE than it credits. The 1-game tier is deliberately
  -- not a discount and sits at par; anything above par would be a penalty for
  -- pre-buying, which is the opposite of the offer.
  constraint pass_tiers_not_a_penalty check (price_czk <= credited_czk),
  constraint pass_tiers_expiry_range check (
    expires_months is null or expires_months between 1 and 24
  )
);

-- The 1-game tier is deliberately not a discount and does not expire: it is
-- the ordinary top-up, priced honestly and listed alongside so the discount on
-- the others is legible.
insert into public.pass_tiers (games, price_czk, credited_czk, expires_months) values
  (1,   150,  150,  null),
  (5,   700,  750,  1),
  (8,  1080, 1200,  1),
  (12, 1560, 1800,  2),
  (15, 1875, 2250,  2),
  (20, 2300, 3000,  2);

alter table public.pass_tiers enable row level security;

-- READ BY EVERYONE. The pass panel sits on the games list, which a signed-out
-- visitor reaches from a shared link — and per the Phase 1 lesson, a missing
-- grant here would render as "no tiers" rather than as an error.
create policy pass_tiers_select_public
  on public.pass_tiers
  for select
  to anon, authenticated
  using (true);

grant select on public.pass_tiers to anon, authenticated, service_role;

comment on table public.pass_tiers is
  'The six game-pass tiers (§4.2). Read by the pass page, the admin screen and '
  'confirm_topup''s exact-price match — one source, so a price change cannot '
  'land in two of the three. No client writes.';

-- -----------------------------------------------------------------------------
-- The requested tier, recorded on the top-up
--
-- A pass purchase is a top-up with a known amount, so it needs no table of its
-- own. What it does need is a record of WHICH TIER was chosen: the receipt
-- states it, the admin screen shows it, and the audit trail otherwise cannot
-- distinguish a 5-pass purchase from someone who happened to send 700.
--
-- NOTE FOR THE GATE. §4.2 keys the pass treatment on the RECEIVED amount
-- matching a pass price, and that is what migration 33 implements. This column
-- means a stricter rule — pass treatment only when a tier was actually chosen
-- — is one predicate away if it is ever wanted. It is not applied here,
-- because the contract is explicit and this is money.
-- -----------------------------------------------------------------------------

alter table public.credit_topups
  add column pass_games integer references public.pass_tiers (games);

comment on column public.credit_topups.pass_games is
  'The tier the player chose, when they chose one. Null for an ordinary '
  'top-up. Recorded for the receipt and the audit trail; the pass treatment '
  'itself keys on the received amount, per §4.2.';

-- =============================================================================
-- The event type — WIDENED IN THE SAME MIGRATION, before anything emits it
--
-- Migration 33 writes `credit_expired` rows from the sweep. Widening there
-- would work too, but the catalog is one CHECK that every migration adding an
-- event has to remember, and it has been forgotten once already — so it goes
-- in with the substrate, where the column it describes is being created.
--
-- Pre-approved widening (contract §1, 2026-08-01): list restated in full,
-- strict superset, one type added and nothing removed.
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
    'site_setting_changed',
    -- game pass (migration 32)
    'credit_expired'
  )
);

-- =============================================================================
-- Reading batches
--
-- One function, used by the allocator, the sweep, the account page and the
-- heads-up. Four callers deriving "what is left in this batch" separately is
-- four chances to derive it differently.
-- =============================================================================

create function public.credit_batches(p_player_id uuid)
returns table (
  batch_id uuid,
  original_czk integer,
  remaining_czk integer,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.delta_czk,
    -- The batch row itself plus every row that draws from, returns to, or
    -- closes it. Redemptions and expiries are negative; refunds are positive.
    (b.delta_czk + coalesce((
      select sum(m.delta_czk)
        from public.credit_ledger m
       where m.batch_id = b.id
    ), 0))::integer,
    b.expires_at,
    b.created_at
  from public.credit_ledger b
  where b.player_id = p_player_id
    and b.expires_at is not null
  order by b.expires_at asc, b.created_at asc;
$$;

-- SERVICE ROLE ONLY, and the narrowing is deliberate rather than cautious.
--
-- This function TAKES A PLAYER ID. Granting it to `authenticated` — which a
-- first draft did — would let any signed-in player read any other player's
-- wallet: how much credit they hold, in how many batches, and when each one
-- expires. That is money and it is nobody else's business; `credit_ledger`
-- itself has carried own-row RLS since Phase 1 for exactly that reason, and a
-- SECURITY DEFINER function that bypasses it must not be handed to sessions.
--
-- `my_credit_batches()` below is the session-scoped exit, and it takes no
-- argument at all.
revoke execute on function public.credit_batches(uuid) from public, anon, authenticated;
grant execute on function public.credit_batches(uuid) to service_role;

comment on function public.credit_batches(uuid) is
  'Every expiring batch for a player, soonest-expiring first — the order '
  'credit is consumed in (§4.2). Remaining is the batch row plus everything '
  'linked to it, so it is never derived twice. NOT callable by a session: it '
  'takes a player id and bypasses the ledger''s own-row RLS. Sessions use '
  'my_credit_batches().';

/**
 * The caller's OWN batches, for `/account`.
 *
 * A separate function rather than a grant on the one above, because that one
 * takes a player id and the whole point here is that a session cannot ask
 * about somebody else's wallet.
 */
create function public.my_credit_batches()
returns table (
  batch_id uuid,
  original_czk integer,
  remaining_czk integer,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.credit_batches(public.current_player_id())
   where public.current_player_id() is not null;
$$;

revoke execute on function public.my_credit_batches() from public, anon;
grant execute on function public.my_credit_batches() to authenticated, service_role;

comment on function public.my_credit_batches() is
  'The calling player''s own expiring batches. Identity from the session, '
  'never from an argument.';
