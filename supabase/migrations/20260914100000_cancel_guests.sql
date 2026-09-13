-- =============================================================================
-- ROUND 34, ITEMS 3 AND 4 — a player can take guests back off, and both
-- add-guest rails end on the confirmation screen.
--
-- ONE MIGRATION, TWO ITEMS, because they are two ends of the same object: the
-- guest count on somebody's booking. Item 3 needs the register to say HOW MANY
-- guests a settled checkout added so the confirmation can name them; item 4
-- needs a way to take them off again. Applying one without the other leaves a
-- product that can add guests and not remove them, which is the state this
-- round exists to end.
--
-- SHAPE ONLY AT THE FOOT OF THIS FILE. No booking is made, no guest is removed
-- and no crown moves. The behaviour is drilled in `supabase/tests/cancel_guests.sql`,
-- which `run.mjs` wraps in `begin; … rollback;`. A migration's verification
-- block may not write a row — on 2026-09-09 one did, against production.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. checkout_outcome gains `guest_count` (item 3)
--
-- WHY THE RETURN PAGE NEEDS IT. Round 27 sent a settled add-guests checkout to
-- the game page on the reasoning that "the confirmation page is about a booking
-- coming into existence". The owner has overruled that: completing a purchase
-- ends on the same BOOKING CONFIRMED moment whether it bought a seat or two
-- more seats. To say "+2 guests confirmed" the page has to know it was two, and
-- the only trustworthy source is the register row the webhook settled — a
-- number in the URL is a number the player can edit.
--
-- DROP AND RECREATE: the return type changes and `create or replace` cannot.
-- -----------------------------------------------------------------------------

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
-- 2. The result shape for a partial cancellation (item 4)
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

-- -----------------------------------------------------------------------------
-- 3. cancel_guests — `cancel_booking`'s rules, applied to a slice of a booking
--
-- IT NEVER TOUCHES THE PLAYER'S OWN SEAT. `p_count` is bounded by
-- `guest_count`, so the smallest a booking can get is the one seat it started
-- as; cancelling that is `cancel_booking` and stays a different act with a
-- different confirmation. A player who wants out entirely presses Cancel.
--
-- THE CUTOFF IS THE SAME EIGHT HOURS AND IT GATES THE REFUND, NOT THE ACT —
-- deliberately identical to `cancel_booking`, whose own comment says why:
-- "Cancelling is still permitted right up to kickoff; only the refund is
-- gated. Freeing the spot late is worth more to everyone else than the
-- player's silence." A guest seat freed two hours before kickoff is worth
-- exactly as much to the eleven other people as the player's own would be.
--
-- WHAT A REMOVED GUEST IS WORTH is a PROPORTIONAL share of the booking, not
-- the game's current price. A booking can have been assembled at two different
-- prices — some seats at the original booking, some added later through
-- `settle_checkout_session`, which adds its own amount to `price_czk` — so the
-- only figure that is certainly true of THIS booking is what it holds divided
-- by the seats it holds. The remaining price is computed first and the refund
-- is the difference, so refund + remainder is exactly the original: no rounding
-- can invent or destroy a crown.
--
-- A LATE REMOVAL CHANGES NEITHER `price_czk` NOR `credit_applied_czk`, which is
-- again `cancel_booking`'s shape: the seat is freed, the money is kept, and the
-- event records `forfeited_czk` so a complaint can be answered later. Reducing
-- the price without refunding would quietly forgive a debt on a `reserved` row.
--
-- THE REFUND IS UNEXPIRING, AND THIS IS A DECISION RATHER THAN AN OVERSIGHT.
-- `cancel_booking` mirrors each redemption back to the batch it came from,
-- carrying that batch's expiry. A PARTIAL refund has no unambiguous batch to
-- return to — the ledger records that credit was spent on this booking, never
-- which seat it bought, and seats are fungible. Splitting it proportionally
-- across batches would be an allocation rule this product has never had to
-- have, with rounding that can over-refund a batch across repeated partial
-- cancellations. So a partial refund lands in the ordinary unexpiring pool,
-- which is never WORSE for the player than the alternative — which is the right
-- way to break a tie about somebody else's money. Full cancellation is
-- unchanged and still mirrors to batches.
-- -----------------------------------------------------------------------------

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
  -- THE SAME EIGHT HOURS `cancel_booking` HOLDS, and read from the same place
  -- the application reads: `cancellation_refund_cutoff_hours()` is what policy
  -- v3 created so this number stops existing in two hand-kept copies.
  v_cutoff_hours numeric;

  v_booking      public.bookings%rowtype;
  v_game         public.games%rowtype;
  v_player_id    uuid;
  v_seats        integer;
  v_lead_hours   numeric(6, 2);
  v_new_price    integer;
  v_new_applied  integer;
  v_price_share  integer;
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

  -- OWN BOOKING ONLY, checked here rather than assumed from the page that
  -- rendered the control: the id travels in a form field.
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

  -- DOWN TO ZERO, NEVER BELOW, and never into the player's own seat. Re-read
  -- under the lock, so two taps in flight at once cannot both pass.
  if p_count is null or p_count < 1 or p_count > v_booking.guest_count then
    raise exception 'INVALID_GUEST_COUNT'
      using detail = 'asked for ' || coalesce(p_count::text, 'null')
                  || ' of ' || v_booking.guest_count::text;
  end if;

  v_cutoff_hours := public.cancellation_refund_cutoff_hours();
  v_seats        := 1 + v_booking.guest_count;
  v_lead_hours   := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  -- The remainder first, the share second: their sum is the original, exactly.
  v_new_price   := round(v_booking.price_czk::numeric * (v_seats - p_count) / v_seats);
  v_new_applied := round(v_booking.credit_applied_czk::numeric * (v_seats - p_count) / v_seats);
  v_price_share := v_booking.price_czk - v_new_price;

  if v_lead_hours >= v_cutoff_hours then
    -- Mirrors `cancel_booking`: a confirmed booking refunds what it is worth,
    -- a reserved one refunds only the credit that was actually applied.
    v_credit := case
                  when v_booking.status = 'confirmed'
                  then v_price_share
                  else v_booking.credit_applied_czk - v_new_applied
                end;

    update public.bookings
       set guest_count        = guest_count - p_count,
           price_czk          = v_new_price,
           credit_applied_czk = v_new_applied
     where id = p_booking_id;
  else
    v_forfeited := case
                     when v_booking.status = 'confirmed'
                     then v_price_share
                     else v_booking.credit_applied_czk - v_new_applied
                   end;

    -- THE SEAT GOES, THE MONEY STAYS. Leaving `price_czk` alone is what keeps
    -- the record of what was paid, which is the only thing that can answer a
    -- question about this booking afterwards.
    update public.bookings
       set guest_count = guest_count - p_count
     where id = p_booking_id;
  end if;

  if v_credit > 0 then
    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'cancellation_credit', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'amount_czk', v_credit,
              'reason', 'cancellation_credit',
              'guests_removed', p_count,
              'returned_to_batches_czk', 0),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_guests_removed', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'removed', p_count,
            'remaining', v_booking.guest_count - p_count,
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'forfeited_czk', v_forfeited,
            'cutoff_hours', v_cutoff_hours,
            'booking_status', v_booking.status),
          v_game.city, v_game.brand);

  /*
   * THE SAME RELEASE EVENT ANY CANCELLATION EMITS, and it is not decoration.
   * `spot_released` is what the waitlist machinery reads as "a seat exists
   * again" — the owner's requirement is that the same machinery fires, and the
   * way to make that true is to emit the same thing rather than something that
   * means the same.
   */
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('previous_status', v_booking.status,
                             'guests_removed', p_count),
          v_game.city, v_game.brand);

  -- A full game with a seat back is not full any more, and nothing downstream
  -- can work that out for itself.
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
  'Removes N guests from the caller''s own booking. Refund is credit and is '
  'gated on the same cutoff as cancel_booking; the removal itself is permitted '
  'up to kickoff. Never touches the player''s own seat.';

-- -----------------------------------------------------------------------------
-- 4. The event catalog
--
-- One addition, `booking_guests_removed`, and the list is restated in full
-- because Postgres cannot extend a CHECK in place. Pre-approved (2026-08-01)
-- while the new list is a strict superset — it is. Forgetting this fails at the
-- first WRITE rather than at the migration, naming a constraint that has
-- nothing to do with the feature.
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
    -- Round 34, item 4.
    'booking_guests_removed'
  )
);

-- -----------------------------------------------------------------------------
-- 5. The capability flags — AND THE FLAGS THIS FILE DID NOT CREATE ARE PROBED
--    RATHER THAN ASSERTED
--
-- THE TRAP THIS CLOSES, found on 2026-09-13. `app_capabilities()` is restated
-- IN FULL by every migration that touches it, so a flag survives only if each
-- later file remembers to carry it — and production was returning
-- `adminRemoveCover: true` with NO `venueMapUrl`, because round 31's file was
-- applied before round 30's and the older list overwrote the newer.
--
-- Carrying the list forward by hand fixes that case and leaves a worse one:
-- this file would claim `playerNumbers: true` on a database where round 33's
-- migration has NOT been applied, which is a flag actively lying about a column
-- that does not exist — and both admin reads answer a missing column by
-- rendering nothing.
--
-- SO EVERY FLAG FOR AN OBJECT THIS MIGRATION DOES NOT ITSELF CREATE IS AN
-- EXISTENCE PROBE. It cannot lie, it cannot be dropped by an out-of-order
-- apply, and it costs one catalog lookup on a `stable` function the app calls
-- once per render. Only the two flags below that this file creates are
-- asserted, because this file is the thing that makes them true.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- Long applied; these predate the out-of-order hazard and their objects
    -- are load-bearing for pages that would be visibly broken without them.
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

    -- Rounds 30-33. PROBED, because these are the ones an out-of-order or
    -- partial apply can leave absent.
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

    -- Round 34. Created by THIS file, so asserted.
    'cancelGuests',           true,
    'addGuestsConfirmation',  true
  )
$$;

-- -----------------------------------------------------------------------------
-- 6. VERIFICATION — SHAPE ONLY. NOT ONE ROW IS WRITTEN.
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps jsonb;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cancel_guests'
  ) then
    raise exception 'cancel guests: the function is missing';
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'cancel_guests_result'
  ) then
    raise exception 'cancel guests: the result type is missing';
  end if;

  -- The return type is the half of item 3 that lives in SQL.
  if not exists (
    select 1 from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
      and p.parameter_name = 'guest_count'
  ) then
    raise exception 'add-guests confirmation: checkout_outcome does not project guest_count';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'events_event_type_catalog') not like '%booking_guests_removed%' then
    raise exception 'cancel guests: the event catalog was not widened';
  end if;

  v_caps := public.app_capabilities();
  if not (v_caps ->> 'cancelGuests')::boolean
     or not (v_caps ->> 'addGuestsConfirmation')::boolean then
    raise exception 'cancel guests: the round-34 flags are not set';
  end if;

  -- The probed flags must AGREE WITH THE CATALOG, which is the whole point of
  -- probing them. Checked against the same objects, independently.
  if (v_caps ->> 'playerNumbers')::boolean <> exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players'
       and column_name = 'player_number'
  ) then
    raise exception 'capabilities: the probed playerNumbers flag disagrees with the catalog';
  end if;

  raise notice 'round 34: shape verified — behaviour is drilled in supabase/tests/cancel_guests.sql';
end $$;
