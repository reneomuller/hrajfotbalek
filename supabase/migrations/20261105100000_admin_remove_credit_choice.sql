-- =============================================================================
-- ROUND 42 — removing a player, with or without their Credit back.
--
-- The owner: "when manually removing a player from a game, it automatically
-- grants them a credit. I need there to be an option for the credit to return
-- or for it not to return ... (this can happen when someone cancels a game
-- last minute and texts us instead of doing it through the app)". The admin
-- dialog's switch starts OFF — no Credit — and is switched on to return it.
--
-- 1. `admin_remove_booking(booking, return_credit default true)`. The DEFAULT
--    is "return" on purpose: the build that predates this round calls it with
--    one argument and keeps exactly the behaviour it had. The new dialog always
--    says which. With the switch off, nothing is written to the ledger and the
--    `admin_booking_removed` event records `withheld_czk` — the amount a later
--    complaint will ask about.
--
-- 2. WHEN THE CREDIT COMES BACK, IT COMES BACK BY ROUND 40'S RULES (the
--    owner's choice), the same block `cancel_booking` runs: a spent Credit
--    returns to its batch with that batch's expiry, money paid becomes a
--    Credit valid `credit_validity_days()` from the payment, and only what is
--    left — credit bought before round 40 — stays unexpiring. Round 40
--    rewrote seven functions and missed this one, which still wrote one
--    unexpiring row for the full amount. No lateness cutoff: an admin removal
--    returns everything or nothing, and the switch is the decision.
--
-- 3. `app_capabilities()` — every earlier flag PROBED, `organizerPlayer`
--    included (round 42's other file may land before or after this one), plus
--    this file's `adminRemoveCreditChoice`.
--
-- Additive in effect, idempotent, NOT deploy-first, order-free against
-- everything applied and against `20261102100000`. The deploy is safe without
-- it: the switch renders only once `app_capabilities()` says
-- `adminRemoveCreditChoice`, and until then removal works as it always did.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261105100000_admin_remove_credit_choice.sql --production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1–2. The function
--
-- DROPPED, NOT REPLACED. Postgres overloads by argument list, so `create or
-- replace` with a second parameter would leave the one-argument function in
-- place beside it — two functions with one name, and a one-argument call
-- binding to the old body (CLAUDE.md: "A SUBSTITUTION CAN LAND IN A FUNCTION
-- NOTHING CALLS"). Nothing in the database calls it; the app does, by name.
-- -----------------------------------------------------------------------------

drop function if exists public.admin_remove_booking(uuid);

create or replace function public.admin_remove_booking(
  p_booking_id uuid,
  p_return_credit boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking     public.bookings%rowtype;
  v_game        public.games%rowtype;
  v_due         integer;
  v_credit      integer;
  v_redemption  record;
  v_refunded    integer := 0;
  v_unexpiring  integer;
  v_paid        integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME — cancel_booking's order. ===
  perform pg_advisory_xact_lock(hashtextextended(v_booking.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  -- Re-read under the lock: a concurrent cancellation may have settled it
  -- between the check above and here.
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  -- What the booking is worth: money paid on a confirmed one, credit applied
  -- on a reservation. Returned in full or not at all.
  if v_booking.status = 'confirmed' then
    v_due := v_booking.price_czk;
  else
    v_due := v_booking.credit_applied_czk;
  end if;
  v_credit := case when p_return_credit then v_due else 0 end;

  update public.bookings
     set status = 'cancelled',
         cancel_lead_hours =
           round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2)
   where id = p_booking_id;

  if v_credit > 0 then
    -- ROUND 40, as cancel_booking: every redemption back to its batch, never
    -- more than the booking is still worth.
    for v_redemption in
      select cl.batch_id, -cl.delta_czk as amount_czk
        from public.credit_ledger cl
       where cl.booking_id = p_booking_id
         and cl.reason = 'redemption'
         and cl.batch_id is not null
    loop
      exit when v_refunded >= v_credit;
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
      values (v_booking.player_id, least(v_redemption.amount_czk, v_credit - v_refunded),
              'cancellation_credit', p_booking_id, v_redemption.batch_id);
      v_refunded := v_refunded + least(v_redemption.amount_czk, v_credit - v_refunded);
    end loop;

    -- ROUND 40: what was paid is a Credit bought on the day it was paid.
    v_paid := case when v_booking.status = 'confirmed'
                   then greatest(v_booking.price_czk - v_booking.credit_applied_czk, 0)
                   else 0 end;
    v_paid := least(v_paid, v_credit - v_refunded);
    if v_paid > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, expires_at)
      values (v_booking.player_id, v_paid, 'cancellation_credit', p_booking_id,
              public.booking_paid_at(p_booking_id)
                + make_interval(days => public.credit_validity_days()));
    end if;

    -- Whatever is left came from the ordinary pool: credit bought before
    -- round 40, which keeps the unexpiring terms it was bought under.
    v_unexpiring := v_credit - v_refunded - v_paid;
    if v_unexpiring > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id, v_unexpiring, 'cancellation_credit', p_booking_id);
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'amount_czk', v_credit,
              'reason', 'admin_removed',
              'returned_to_batches_czk', v_refunded,
              'paid_credit_czk', v_paid),
            v_game.city, v_game.brand);
  end if;

  -- No new event TYPE: new keys on an existing type need no catalog change.
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('admin_booking_removed', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'credit_issued_czk', v_credit,
            'credit_returned',   p_return_credit,
            'withheld_czk',      v_due - v_credit),
          v_game.city, v_game.brand);

  -- The seat is free again, so the fullness flag and the waitlist both matter.
  perform public.sync_game_fullness(v_booking.game_id);

  return v_credit;
end
$$;

revoke execute on function public.admin_remove_booking(uuid, boolean) from public, anon;
grant execute on function public.admin_remove_booking(uuid, boolean) to authenticated, service_role;

comment on function public.admin_remove_booking(uuid, boolean) is
  'Admin releases a player''s seat (round 42): with p_return_credit, the full '
  'value back by round-40 rules (batches keep their expiry, money paid becomes '
  'a 60-day Credit); without it, nothing, and the event records what was '
  'withheld. Defaults to returning, so a one-argument caller keeps the old '
  'behaviour. Returns the Credit issued in CZK.';

-- -----------------------------------------------------------------------------
-- 3. app_capabilities() — every earlier flag probed, plus this file's one.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable security definer
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
    'cancelGuests',      to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')),
    'creditsAreSeats',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_seat_price_czk')),
    'seatsTakenMany',    to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'game_seats_taken_many')),
    'banProfile',        to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ban_player')),
    'addGuestsConfirmation', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
        and p.parameter_name = 'guest_count')),
    'durationPricing',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'price_for_duration')),
    'venueArchive',      to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'archived_at')),
    'creditsSixtyDays',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_validity_days')),
    'consentRecords',    to_jsonb(exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'consent_records')),
    'deleteAccount',     to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_player_account')),
    'gameNumbers',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'games'
         and column_name = 'game_number')),
    'dismissOneNotification', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dismiss_notification')),
    -- Round 42's other file, which may land before or after this one.
    'organizerPlayer',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_game_organizer_player')),
    -- Created by THIS file.
    'adminRemoveCreditChoice', true
  )
$$;

-- -----------------------------------------------------------------------------
-- 4. VERIFICATION — SHAPE ONLY.
--
-- Not "every flag true": `organizerPlayer` is round 42's other file and may
-- honestly be false here. This file asserts what it created.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_remove_booking') <> 1 then
    raise exception 'remove credit choice: admin_remove_booking is not exactly one function';
  end if;
  if not exists (select 1 from information_schema.routines r
                   join information_schema.parameters p on p.specific_name = r.specific_name
                  where r.routine_schema = 'public' and r.routine_name = 'admin_remove_booking'
                    and p.parameter_name = 'p_return_credit') then
    raise exception 'remove credit choice: admin_remove_booking has no p_return_credit';
  end if;
  if has_function_privilege('anon', 'public.admin_remove_booking(uuid, boolean)', 'execute') then
    raise exception 'remove credit choice: anon can execute admin_remove_booking';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 35
     or not (v_caps ->> 'adminRemoveCreditChoice')::boolean then
    raise exception 'round 42: app_capabilities is not 35 flags with adminRemoveCreditChoice: %', v_caps;
  end if;
end $$;
