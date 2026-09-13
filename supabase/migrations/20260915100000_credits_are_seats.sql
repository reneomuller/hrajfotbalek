-- =============================================================================
-- ROUND 35 — CREDITS ARE SEAT-DENOMINATED, FLAT.
--
-- THE RULING (owner, 2026-09-15, overruling row 277): **1 credit = 1 game = 1
-- seat, everywhere, regardless of the game's `price_czk`.** N seats cost
-- exactly N credits, the ledger records −150 per credit-paid seat, and the
-- price-based debit is removed from every credit path. Card payments keep
-- charging the game's actual price.
--
-- WHAT WAS TRUE BEFORE, AND WHY IT WAS FOUND. Round 34 verified what the credit
-- rail actually debits and reported `game.price_czk × guests` — identical to
-- `150 × guests` on the 150 CZK game and not on the 180 and 200 CZK ones. The
-- report named it a ruling rather than a bug and left it alone; this is the
-- ruling.
--
-- THE DIFFERENCE IS ACCEPTED AND IS RECORDED HERE RATHER THAN HIDDEN: on a
-- legacy 200 CZK fixture a seat now costs one credit (150) by credit and 200 by
-- card. The owner has accepted that gap for the old games. It closes on its own
-- as fixtures are priced at 150.
--
-- SHAPE ONLY AT THE FOOT OF THIS FILE. No booking is made and no crown moves;
-- the behaviour is drilled in `supabase/tests/credits_are_seats.sql`, which
-- `run.mjs` wraps in `begin; … rollback;`.
--
-- SELF-SUFFICIENT WITH RESPECT TO ROUND 34. `20260914100000_cancel_guests.sql`
-- may or may not have been applied when this runs, so everything it needs from
-- that file is created here too, guarded. Applying 34 then 35 and applying 35
-- alone both end in the same place.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. What one credit is worth, as a function
--
-- THE SQL TWIN OF `PASS_REFERENCE_PRICE_CZK`, and the reason it is a function
-- rather than a literal repeated three times is round 33's lesson about the
-- party ceiling: a number that lives in two places disagrees exactly once, in
-- the window between a migration and the deploy that matches it, and during
-- that window the product takes the wrong amount of somebody's money.
--
-- `pass_tiers_credited_rule` still spells 150 as a literal in its CHECK. That
-- one is a CONSTRAINT on stored rows rather than an arithmetic path, and
-- rewriting a check constraint to call a function would make every insert pay
-- for a function call to learn something that has not changed since Phase 1.
-- -----------------------------------------------------------------------------

create or replace function public.credit_seat_price_czk()
returns integer
language sql
immutable
set search_path = ''
as $$ select 150 $$;

revoke execute on function public.credit_seat_price_czk() from public;
grant execute on function public.credit_seat_price_czk() to anon, authenticated, service_role;

comment on function public.credit_seat_price_czk() is
  'What one credit buys: one seat, flat, whatever the game costs by card. The '
  'authority; lib/pass/creditPrice.ts mirrors it for display.';

-- -----------------------------------------------------------------------------
-- 2. create_booking_internal — credit applies BY THE SEAT
--
-- ~~`v_credit_applied := least(greatest(v_balance, 0), v_price)`~~ — take as
-- many crowns as the wallet holds, up to the card price. That is what made a
-- credit seat cost whatever the game cost.
--
-- IT IS NOW WHOLE SEATS OR NOTHING, which is what "1 credit = 1 seat" means
-- arithmetically: floor the balance into credits, cap that at the seats being
-- booked, and charge the REMAINING seats at the game's own price. A player with
-- one credit booking a party of three pays one credit and two card seats, and
-- `price_czk` is the sum — so the row still says exactly what the booking is
-- worth, which is what every refund path reads.
--
-- A FREE GAME SPENDS NO CREDIT. `price_czk = 0` short-circuits to zero applied,
-- because otherwise a wallet would be charged a credit for a seat the product
-- is giving away — the one case where seat-denomination costs a player
-- something for nothing.
--
-- REWRITTEN IN PLACE RATHER THAN RESTATED. `create_booking_internal` is 203
-- lines of heavily commented plpgsql carrying decisions from four earlier
-- rounds; pasting it here to change three statements would make this file the
-- newest copy of all of it. It reads what is INSTALLED, substitutes the two
-- statements, and RAISES if the text it expects is not there — so it edits
-- production's function rather than the repo's idea of it, and `prosrc` keeps
-- comments so nothing is lost in the round trip. Same mechanism as round 33's
-- party ceiling.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text :=
    E'    v_credit_applied := least(greatest(v_balance, 0), v_price);\n'
    '    v_amount_due     := v_price - v_credit_applied;';
  v_new constant text :=
    E'    -- ROUND 35: CREDIT BUYS WHOLE SEATS AT A FLAT RATE, never a slice of\n'
    '    -- the card price. Floor the balance into credits, cap at the seats\n'
    '    -- being booked, and charge what is left at the game''s own price. A\n'
    '    -- free game spends nothing.\n'
    '    v_credit_applied := case when v_game.price_czk > 0 then\n'
    '        least(v_seats, greatest(v_balance, 0) / public.credit_seat_price_czk())\n'
    '          * public.credit_seat_price_czk()\n'
    '      else 0 end;\n'
    '    v_price          := v_credit_applied\n'
    '      + (v_seats - v_credit_applied / public.credit_seat_price_czk()) * v_game.price_czk;\n'
    '    v_amount_due     := v_price - v_credit_applied;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking_internal';

  if v_def is null then
    raise exception 'credits are seats: create_booking_internal is missing';
  end if;

  if position('credit_seat_price_czk' in v_def) > 0 then
    raise notice 'credits are seats: create_booking_internal already applies credit by the seat';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'credits are seats: create_booking_internal does not carry the expected '
      'credit block — it has changed and this substitution must be re-derived';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. add_guests_with_credit — N guests cost N credits
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := 'v_cost := v_game.price_czk * p_guest_count;';
  v_new constant text :=
    'v_cost := public.credit_seat_price_czk() * p_guest_count;  -- ROUND 35: flat per seat';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'add_guests_with_credit';

  if v_def is null then
    raise exception 'credits are seats: add_guests_with_credit is missing';
  end if;

  if position('credit_seat_price_czk' in v_def) > 0 then
    raise notice 'credits are seats: add_guests_with_credit already charges the flat rate';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'credits are seats: add_guests_with_credit does not carry the expected cost line';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. cancel_guests — a credit-paid seat refunds exactly one credit
--
-- CREATED HERE IN FULL, guarded, because round 34's migration may not have been
-- applied yet. Its rules are unchanged from that file except for what a removed
-- seat is worth.
--
-- ~~A PROPORTIONAL SHARE OF THE WHOLE BOOKING.~~ Round 34 divided `price_czk`
-- by the seats, which was the only honest figure while a credit seat and a card
-- seat could cost different amounts of the SAME booking. Under the ruling they
-- still can — a mixed booking holds credit seats at 150 and card seats at the
-- game's price — so the split is now explicit rather than averaged:
--
--   * seats backed by credit refund exactly one credit each, and
--   * the rest refund their share of what was paid by card.
--
-- CREDIT SEATS COME OFF FIRST, deliberately. The two are indistinguishable —
-- the ledger records that credit was spent on a booking, never which seat it
-- bought — so the order is a choice, and taking the credit seat first is the
-- one that returns the player a spendable credit rather than a part-share of a
-- card payment. It is also the only order under which the owner's acceptance
-- holds: two guests added with credit, one removed, +150 back.
--
-- A LEGACY BOOKING WHOSE `credit_applied_czk` IS NOT A MULTIPLE OF 150 — every
-- credit booking made before this migration on a 180 or 200 CZK game — floors
-- into whole credit seats and the remainder stays with the card side. It cannot
-- refund more than was taken, which is the only invariant that matters here.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'cancel_guests_result'
  ) then
    create type public.cancel_guests_result as (
      booking_id        uuid,
      guests_remaining  integer,
      credit_issued_czk integer,
      forfeited_czk     integer,
      cancel_lead_hours numeric(6, 2)
    );
  end if;
end $$;

create or replace function public.cancel_guests(
  p_booking_id uuid,
  p_count      integer
)
returns public.cancel_guests_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff_hours numeric;
  v_seat_credit  integer;

  v_booking      public.bookings%rowtype;
  v_game         public.games%rowtype;
  v_player_id    uuid;
  v_seats        integer;
  v_lead_hours   numeric(6, 2);

  v_credit_seats integer;   -- seats on this booking that credit paid for
  v_from_credit  integer;   -- of the removed seats, how many those are
  v_from_card    integer;
  v_card_seats   integer;
  v_card_total   integer;
  v_card_share   integer;
  v_worth        integer;   -- what the removed seats are worth, however paid
  v_credit       integer := 0;
  v_forfeited    integer := 0;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'cancel_guests removes guests from the caller''s own booking';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(v_booking.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games    g where g.id = v_booking.game_id;

  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'CANCEL_WINDOW_CLOSED'
      using detail = 'game status ' || v_game.status::text
                  || ', starts_at ' || v_game.starts_at::text;
  end if;

  if p_count is null or p_count < 1 or p_count > v_booking.guest_count then
    raise exception 'INVALID_GUEST_COUNT'
      using detail = 'asked for ' || coalesce(p_count::text, 'null')
                  || ' of ' || v_booking.guest_count::text;
  end if;

  v_cutoff_hours := public.cancellation_refund_cutoff_hours();
  v_seat_credit  := public.credit_seat_price_czk();
  v_seats        := 1 + v_booking.guest_count;
  v_lead_hours   := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  -- How this booking was paid for, seat by seat.
  v_credit_seats := v_booking.credit_applied_czk / v_seat_credit;
  if v_credit_seats > v_seats then v_credit_seats := v_seats; end if;

  v_from_credit := least(p_count, v_credit_seats);
  v_from_card   := p_count - v_from_credit;
  v_card_seats  := v_seats - v_credit_seats;
  v_card_total  := v_booking.price_czk - v_booking.credit_applied_czk;

  if v_card_seats > 0 and v_from_card > 0 then
    v_card_share := round(v_card_total::numeric * v_from_card / v_card_seats);
  else
    v_card_share := 0;
  end if;

  v_worth := v_from_credit * v_seat_credit + v_card_share;

  if v_lead_hours >= v_cutoff_hours then
    /*
     * WHAT COMES BACK. A confirmed booking's card money arrived, so it returns
     * as credit like everything else — ruling O's refund-in-kind. A reserved
     * one never received the card half, so only the credit half can come back,
     * which is `cancel_booking`'s rule for the same reason.
     */
    v_credit := case
                  when v_booking.status = 'confirmed' then v_worth
                  else v_from_credit * v_seat_credit
                end;

    update public.bookings
       set guest_count        = guest_count - p_count,
           price_czk          = price_czk - v_worth,
           credit_applied_czk = credit_applied_czk - v_from_credit * v_seat_credit
     where id = p_booking_id;
  else
    v_forfeited := case
                     when v_booking.status = 'confirmed' then v_worth
                     else v_from_credit * v_seat_credit
                   end;

    -- THE SEAT GOES, THE MONEY STAYS. Leaving the amounts alone is what keeps
    -- the record of what was paid, which is the only thing that can answer a
    -- question about this booking afterwards.
    update public.bookings
       set guest_count = guest_count - p_count
     where id = p_booking_id;
  end if;

  if v_credit > 0 then
    /*
     * UNEXPIRING, AND IT IS A DECISION (round 34, row 271, closed AS BUILT by
     * the owner). `cancel_booking` mirrors each redemption back to the batch it
     * came from, carrying that batch's expiry. A PARTIAL refund has no
     * unambiguous batch — the ledger records that credit was spent on a
     * booking, never which seat it bought — so it lands in the ordinary
     * unexpiring pool, which is never worse for the player.
     */
    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'cancellation_credit', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'amount_czk', v_credit,
              'reason', 'cancellation_credit',
              'guests_removed', p_count,
              'seats_from_credit', v_from_credit,
              'returned_to_batches_czk', 0),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_guests_removed', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'removed', p_count,
            'remaining', v_booking.guest_count - p_count,
            'seats_from_credit', v_from_credit,
            'seats_from_card', v_from_card,
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'forfeited_czk', v_forfeited,
            'cutoff_hours', v_cutoff_hours,
            'booking_status', v_booking.status),
          v_game.city, v_game.brand);

  /*
   * THE SAME RELEASE EVENT ANY CANCELLATION EMITS. `spot_released` is what the
   * waitlist machinery reads as "a seat exists again"; emitting something that
   * MEANS the same would not fire it.
   */
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('previous_status', v_booking.status,
                             'guests_removed', p_count),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id,
          v_booking.guest_count - p_count,
          v_credit,
          v_forfeited,
          v_lead_hours)::public.cancel_guests_result;
end;
$$;

revoke execute on function public.cancel_guests(uuid, integer) from public;
revoke execute on function public.cancel_guests(uuid, integer) from anon;
grant execute on function public.cancel_guests(uuid, integer) to authenticated, service_role;

comment on function public.cancel_guests(uuid, integer) is
  'Removes N guests from the caller''s own booking. A credit-paid seat refunds '
  'exactly one credit; a card-paid seat refunds its share. Gated on '
  'cancel_booking''s cutoff; the removal itself is permitted up to kickoff.';

-- -----------------------------------------------------------------------------
-- 5. The event catalog and checkout_outcome, for a database without round 34
--
-- Both are idempotent and both are round 34's. Restated so that applying this
-- file alone leaves a working product rather than one whose cancel_guests
-- raises on its own event type.
-- -----------------------------------------------------------------------------

alter table public.events drop constraint if exists events_event_type_catalog;
alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    'account_created', 'auth_link_sent', 'auth_completed', 'player_claimed',
    'game_published', 'game_cancelled', 'game_settled', 'game_guests_changed',
    'game_deleted', 'booking_created', 'admin_booking_created',
    'booking_cancelled', 'booking_expired', 'spot_released',
    'admin_booking_removed', 'payment_confirmed', 'payment_unmatched',
    'credit_issued', 'credit_redeemed', 'credit_expired', 'topup_requested',
    'topup_confirmed', 'waitlist_joined', 'waitlist_notified',
    'waitlist_converted', 'waitlist_left', 'nudge_sent', 'reminder_sent',
    'attendance_marked', 'admin_granted', 'admin_revoked',
    'profile_photo_removed', 'player_anonymized', 'site_setting_changed',
    'venue_deleted', 'booking_guests_added', 'player_renamed',
    'booking_guests_removed'
  )
);

drop function if exists public.checkout_outcome(text);

create function public.checkout_outcome(p_stripe_session_id text)
returns table (status text, game_id uuid, booking_id uuid, kind text, guest_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select cs.status, cs.game_id, cs.booking_id, cs.kind, cs.guest_count
    from public.checkout_sessions cs
   where cs.stripe_session_id = p_stripe_session_id
     and cs.player_id = public.current_player_id();
$$;

revoke execute on function public.checkout_outcome(text) from public;
grant execute on function public.checkout_outcome(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5b. game_seats_taken_many — ONE COUNTER, AND THE ADMIN CAN REACH IT IN BULK
--
-- THE BUG THIS EXISTS FOR. Three admin surfaces counted BOOKING ROWS where
-- every player surface counts SEATS: `/admin/games` and the game page's
-- `{booked}/{capacity}` readout through `countActiveBookings`, and the `/admin`
-- dashboard through a query of its own. A booking with two guests read as 1.
-- The player side has counted seats since round 11 — `game_roster_public` emits
-- one row per seat — so the two halves of the product disagreed about how full
-- a pitch was, and the ADMIN half was the one deciding whether to chase people.
--
-- WHY A BATCH FUNCTION RATHER THAN N CALLS. The admin list decorates every game
-- on the page; calling `game_seats_taken` per row would be a round trip per
-- game on a page whose job is to load fast, which is the same reasoning the
-- dashboard's own comment gives for batching. This wraps the authority rather
-- than reimplementing it: the arithmetic stays in `game_seats_taken`, so there
-- is still exactly one definition of a taken seat.
--
-- WHY NOT `game_roster_public`, WHICH IS WHAT THE PLAYER SIDE COUNTS. That view
-- admits four PUBLIC statuses; the admin lists drafts and cancelled games too,
-- and a counter that silently returns zero for half the rows it is asked about
-- is the same class of bug as the one being fixed.
-- -----------------------------------------------------------------------------

create or replace function public.game_seats_taken_many(p_game_ids uuid[])
returns table (game_id uuid, seats_taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, public.game_seats_taken(g.id)
    from public.games g
   where g.id = any(p_game_ids)
$$;

revoke execute on function public.game_seats_taken_many(uuid[]) from public;
grant execute on function public.game_seats_taken_many(uuid[])
  to anon, authenticated, service_role;

comment on function public.game_seats_taken_many(uuid[]) is
  'Seats taken for many games in one round trip. Wraps game_seats_taken, which '
  'stays the single definition of a taken seat.';

-- -----------------------------------------------------------------------------
-- 6. The capability flags
--
-- Everything this file does not itself create is an EXISTENCE PROBE, which is
-- round 34's rule and the reason applying these migrations in any order is
-- safe: a flag reports what is in the database rather than what the newest file
-- hoped for.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',          true,
    'dismissNotifications',   true,
    'adminRemoveBooking',     true,
    'adminDelete',            true,
    'cancelWithReason',       true,
    'gameLanguage',           true,
    'organizerTelegram',      true,
    'playersMet',             true,
    'playedSweep',            true,
    'playerNotifications',    true,
    'pendingSeatAnonymous',   true,
    'payFirstCheckout',       true,
    'addGuestsAfterBooking',  true,
    'publicProfileScope',     true,
    'creditLedgerNote',       true,
    'autoSettle',             true,

    'adminRemoveCover',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'remove_profile_cover')),
    'venueMapUrl',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'map_url')),
    'playerNumbers',     to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'player_number')),
    'adminRenamePlayer', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_set_display_name')),
    'partyUpToThirteen', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'max_party_guests')),

    -- Created or guaranteed by THIS file.
    'cancelGuests',           true,
    'addGuestsConfirmation',  true,
    'creditsAreSeats',        true,
    'seatsTakenMany',         true
  )
$$;

-- -----------------------------------------------------------------------------
-- 7. VERIFICATION — SHAPE ONLY. NOT ONE ROW IS WRITTEN AND NO CROWN MOVES.
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps jsonb;
begin
  if public.credit_seat_price_czk() <> 150 then
    raise exception 'credits are seats: the seat price is %', public.credit_seat_price_czk();
  end if;

  for v_caps in
    select 1 where (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'create_booking_internal')
                   not like '%credit_seat_price_czk%'
  loop
    raise exception 'credits are seats: create_booking_internal still prices credit by the game';
  end loop;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'add_guests_with_credit')
     not like '%credit_seat_price_czk%' then
    raise exception 'credits are seats: add_guests_with_credit still prices credit by the game';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')
     not like '%credit_seat_price_czk%' then
    raise exception 'credits are seats: cancel_guests still refunds proportionally';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'game_seats_taken_many'
  ) then
    raise exception 'one counter: game_seats_taken_many is missing';
  end if;

  v_caps := public.app_capabilities();
  if not (v_caps ->> 'creditsAreSeats')::boolean
     or not (v_caps ->> 'cancelGuests')::boolean
     or not (v_caps ->> 'seatsTakenMany')::boolean then
    raise exception 'credits are seats: the round-35 flags are not set';
  end if;

  raise notice 'round 35: shape verified — behaviour is drilled in supabase/tests/credits_are_seats.sql';
end $$;
