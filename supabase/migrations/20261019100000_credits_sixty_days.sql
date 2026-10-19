-- =============================================================================
-- ROUND 40 — every game is bought as a Credit, and a Credit lasts sixty days.
--
-- The lawyer's Obchodní podmínky v2.0 (published at /terms this round) say:
--
--   5.1  a game is booked ONLY with a Credit. The owner's ruling: the checkout
--        stays exactly as it is, and buying a single game IS buying one Credit
--        that is spent on that game at once. Nothing new happens at payment —
--        what changes is what comes BACK when the booking is cancelled.
--   5.4  every Credit is valid 60 days from the day it was credited.
--   9.1  a player who cancels at least 12 hours ahead gets the Credit back
--        "s původní dobou platnosti" — with the validity it had.
--   11.3 when WE cancel a game, the returned Credit's validity grows by 7
--        days, and never ends sooner than 7 days from the refund.
--
-- WHAT THIS FILE CHANGES
--   1. Policy values, one function each: credit_validity_days() = 60,
--      cancelled_game_extension_days() = 7, cancellation_refund_cutoff_hours()
--      = 12, and price_for_duration() prefills 180 for EVERY length — the
--      150 CZK hour is gone, because a game is one Credit.
--   2. A Credit pays for a game of any length: credit_seat_minutes() and the
--      two checks that read it are removed.
--   3. Every confirmed top-up — a pass or anything else — is a batch valid 60
--      days. The pass tier's `expires_months` is no longer read (the column
--      stays: the deployed build still selects it).
--   4. Refunds of PAID money (card, or the old QR rail) are Credits valid 60
--      days from the payment, in a batch of their own — `cancel_booking`,
--      `cancel_guests`, and the "paid but no seat" path of
--      `settle_checkout_session`. Credit bought before this round (the
--      unexpiring pool) keeps the terms it was bought under (Podmínky 18.3).
--   5. `cancel_game` implements 11.3 — and, for the first time, mirrors pass
--      spends back as Credits that EXPIRE. It used to turn them unexpiring.
--   6. A BUG FIX, found while writing this round's drill: a booking whose
--      guests had been removed in time, and which was then cancelled in time,
--      mirrored EVERY redemption it had ever written back to the pass —
--      including the guests' seats, which `cancel_guests` had already
--      refunded. Three Credits spent came back as five. Production has never
--      had a guest removed, so nothing was paid out wrongly. The mirror is now
--      capped at what the booking is still worth.
--   7. consent_records (Texty 2.4): who ticked what, when, in which language,
--      against which version of the terms.
--   8. app_capabilities(), restated as a superset of the 28 flags LIVE on
--      2026-10-19, with `creditsSixtyDays` and `consentRecords` added.
--
-- ADDITIVE IN EFFECT, IDEMPOTENT, ORDER-FREE against round 39's two, and safe
-- to apply before the deploy: the old build reads the cutoff from
-- cancellation_refund_cutoff_hours() and calls nothing this file removes.
-- Shape-only verification at the foot; the behaviour is drilled in
-- supabase/tests/credits_sixty_days.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. POLICY VALUES
-- -----------------------------------------------------------------------------

create or replace function public.credit_validity_days()
returns integer language sql immutable set search_path = ''
as $$ select 60 $$;

comment on function public.credit_validity_days() is
  'Days a Credit is valid from the day it was credited (Obchodní podmínky 5.4). '
  'Mirrored by policy.credits.validityDays in lib/policy.ts.';

create or replace function public.cancelled_game_extension_days()
returns integer language sql immutable set search_path = ''
as $$ select 7 $$;

comment on function public.cancelled_game_extension_days() is
  'Days added to a Credit returned because WE cancelled the game, and the '
  'shortest validity such a Credit can have (Obchodní podmínky 11.3).';

grant execute on function public.credit_validity_days() to anon, authenticated, service_role;
grant execute on function public.cancelled_game_extension_days() to anon, authenticated, service_role;

create or replace function public.cancellation_refund_cutoff_hours()
returns integer language sql stable set search_path = ''
as $$ select 12 $$;

/*
 * A GAME IS ONE CREDIT, SO EVERY LENGTH PREFILLS THE CREDIT PRICE. Called
 * rather than restated: the price lives in credit_seat_price_czk() and nowhere
 * else, which is the round-35-v2 lesson about copies.
 */
create or replace function public.price_for_duration(p_minutes integer)
returns integer language sql immutable set search_path = ''
as $$ select public.credit_seat_price_czk() $$;

comment on function public.price_for_duration(integer) is
  'What the admin form PREFILLS as a game''s price. Since round 40 every '
  'length prefills the price of one Credit; the organizer can still type '
  'another number.';

/*
 * WHEN THE MONEY FOR A BOOKING WAS PAID: the later of the booking itself and
 * any add-guests checkout settled onto it. "Later" is the generous reading for
 * a booking paid in two instalments — the base seat's Credit is dated from the
 * second payment, never earlier than the terms allow for either.
 */
create or replace function public.booking_paid_at(p_booking_id uuid)
returns timestamptz language sql stable security definer set search_path = ''
as $$
  select greatest(
           b.created_at,
           coalesce((select max(cs.settled_at)
                       from public.checkout_sessions cs
                      where cs.booking_id = b.id and cs.status = 'booked'),
                    b.created_at))
    from public.bookings b
   where b.id = p_booking_id
$$;

revoke execute on function public.booking_paid_at(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- THE SUBSTITUTION HELPER. Same contract as rounds 35–36: read the installed
-- body, replace text that MUST be there, and RAISE rather than overwrite a body
-- that has moved on. Every replacement carries the marker `ROUND 40`, so a
-- second run is a notice, not a double edit.
-- -----------------------------------------------------------------------------

create function pg_temp.round40_substitute(p_function text, p_old text[], p_new text[])
returns void language plpgsql as $$
declare
  v_def   text;
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_function;
  if v_count <> 1 then
    raise exception 'round 40: expected exactly one public.%, found %', p_function, v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_function;

  if position('ROUND 40' in v_def) > 0 then
    raise notice 'round 40: public.% already carries round 40', p_function;
    return;
  end if;

  for i in 1 .. array_length(p_old, 1) loop
    if position(p_old[i] in v_def) = 0 then
      raise exception 'round 40: public.% does not carry the text this migration replaces (#%)',
        p_function, i;
    end if;
    v_def := replace(v_def, p_old[i], p_new[i]);
  end loop;

  execute v_def;
end $$;

-- -----------------------------------------------------------------------------
-- 2. A CREDIT PAYS FOR A GAME OF ANY LENGTH
-- -----------------------------------------------------------------------------

select pg_temp.round40_substitute('create_booking_internal',
  array[$old$    -- ROUND 35 v5: A CREDIT IS A 90-MINUTE SEAT. A game of any other
    -- length takes no credit at all — it is online-only, and the booking
    -- below comes back owing its whole price.
    v_credit_applied := case when v_game.price_czk > 0
      and coalesce(v_game.duration_minutes, 60) = public.credit_seat_minutes() then$old$],
  array[$new$    -- ROUND 40: A CREDIT PAYS FOR A GAME OF ANY LENGTH. Every game is one
    -- Credit (Obchodní podmínky 5.1–5.2); the 90-minute rule is gone.
    v_credit_applied := case when v_game.price_czk > 0 then$new$]);

select pg_temp.round40_substitute('add_guests_with_credit',
  array[$old$  -- ROUND 35 v5: a credit is a 90-minute seat; anything else is online-only.
  if coalesce(v_game.duration_minutes, 60) <> public.credit_seat_minutes() then
    raise exception 'GAME_NOT_CREDIT_ELIGIBLE'
      using detail = 'a credit buys a ' || public.credit_seat_minutes()::text
                  || '-minute seat';
  end if;$old$],
  array[$new$  -- ROUND 40: a Credit pays for a game of any length.$new$]);

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc like '%credit_seat_minutes%'
                and p.proname <> 'credit_seat_minutes') then
    raise exception 'round 40: a function still reads credit_seat_minutes()';
  end if;
end $$;

drop function if exists public.credit_seat_minutes();

-- -----------------------------------------------------------------------------
-- 3. EVERY TOP-UP IS A BATCH, VALID SIXTY DAYS
-- -----------------------------------------------------------------------------

select pg_temp.round40_substitute('confirm_topup',
  array[
    $old$  v_expires_at timestamptz := null;$old$,
    $old$      if v_tier.expires_months is not null then
        v_expires_at := now() + make_interval(months => v_tier.expires_months);
      end if;$old$,
    $old$  -- A batch row when the pass expires; an ordinary unexpiring row otherwise.$old$],
  array[
    $new$  -- ROUND 40: EVERY top-up is a Credit batch valid credit_validity_days()
  -- from today (Obchodní podmínky 5.4) — a pass or anything else.
  v_expires_at timestamptz := now() + make_interval(days => public.credit_validity_days());$new$,
    $new$      -- ROUND 40: the tier no longer sets the expiry; see the declaration.
      null;$new$,
    $new$  -- Always a batch row since round 40.$new$]);

-- -----------------------------------------------------------------------------
-- 4. A PLAYER CANCELS: paid money comes back as a Credit dated from the payment
-- -----------------------------------------------------------------------------

select pg_temp.round40_substitute('cancel_booking',
  array[
    $old$   * THE CUTOFF. EIGHT HOURS SINCE POLICY v3.$old$,
    $old$  v_cutoff_hours constant numeric := 8;$old$,
    $old$  v_unexpiring  integer;$old$,
    $old$      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
      values (v_booking.player_id, v_redemption.amount_czk, 'cancellation_credit',
              p_booking_id, v_redemption.batch_id);
      v_refunded := v_refunded + v_redemption.amount_czk;$old$,
    $old$    -- Whatever is left is credit that came from the ordinary pool, plus the
    -- cash or QR the player actually paid on a confirmed booking. Both are
    -- unexpiring, which is Phase 1 behaviour unchanged.
    v_unexpiring := v_credit - v_refunded;$old$,
    $old$              'returned_to_batches_czk', v_refunded),$old$],
  array[
    $new$   * THE CUTOFF. TWELVE HOURS SINCE ROUND 40 (Obchodní podmínky 9.1), and
   * READ from `cancellation_refund_cutoff_hours()` rather than restated, so the
   * number lives in one place.$new$,
    $new$  v_cutoff_hours constant numeric := public.cancellation_refund_cutoff_hours();$new$,
    $new$  v_unexpiring  integer;
  v_paid        integer;$new$,
    $new$      -- ROUND 40: NEVER MORE THAN THE BOOKING IS STILL WORTH. Guests
      -- removed in time were refunded by cancel_guests already; their
      -- redemptions are still on the ledger and must not come back twice.
      exit when v_refunded >= v_credit;
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
      values (v_booking.player_id, least(v_redemption.amount_czk, v_credit - v_refunded),
              'cancellation_credit', p_booking_id, v_redemption.batch_id);
      v_refunded := v_refunded + least(v_redemption.amount_czk, v_credit - v_refunded);$new$,
    $new$    -- ROUND 40: WHAT WAS PAID IS A CREDIT BOUGHT ON THE DAY IT WAS PAID.
    -- Card (or old QR rail) money on a confirmed booking comes back valid
    -- credit_validity_days() from the payment, in a batch of its own — the
    -- terms' "s původní dobou platnosti".
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
    v_unexpiring := v_credit - v_refunded - v_paid;$new$,
    $new$              'returned_to_batches_czk', v_refunded,
              'paid_credit_czk', v_paid),$new$]);

select pg_temp.round40_substitute('cancel_guests',
  array[$old$    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'cancellation_credit', p_booking_id);$old$],
  array[$new$    -- ROUND 40: the CARD share is a Credit bought when it was paid, valid
    -- credit_validity_days() from then, in a batch of its own. The CREDIT
    -- share keeps row 271's ruling and lands in the unexpiring pool.
    if v_booking.status = 'confirmed' and v_card_share > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, expires_at)
      values (v_booking.player_id, v_card_share, 'cancellation_credit', p_booking_id,
              public.booking_paid_at(p_booking_id)
                + make_interval(days => public.credit_validity_days()));
    end if;
    if v_credit - (case when v_booking.status = 'confirmed' then v_card_share else 0 end) > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id,
              v_credit - (case when v_booking.status = 'confirmed' then v_card_share else 0 end),
              'cancellation_credit', p_booking_id);
    end if;$new$]);

select pg_temp.round40_substitute('settle_checkout_session',
  array[$old$  insert into public.credit_ledger (player_id, delta_czk, reason)
       values (v_session.player_id, p_amount_czk, 'cancellation_credit');$old$],
  array[$new$  -- ROUND 40: the payment bought a Credit today, valid credit_validity_days().
  insert into public.credit_ledger (player_id, delta_czk, reason, expires_at)
       values (v_session.player_id, p_amount_czk, 'cancellation_credit',
               now() + make_interval(days => public.credit_validity_days()));$new$]);

-- -----------------------------------------------------------------------------
-- 5. WE CANCEL A GAME — Obchodní podmínky 11.3
--
-- Rewritten whole rather than substituted: the refund is now three parts with
-- three expiries, and that is a new body, not an edit. The drift guard below
-- refuses to replace a body that is not the one this file was written against.
-- -----------------------------------------------------------------------------

do $$
declare v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_game';
  if v_src is null then
    raise exception 'round 40: public.cancel_game is missing';
  end if;
  if position('ROUND 40' in v_src) = 0
     and position('values (v_booking.player_id, v_credit, ''cancellation_credit'', v_booking.id);' in v_src) = 0 then
    raise exception 'round 40: public.cancel_game is not the body this migration replaces';
  end if;
end $$;

create or replace function public.cancel_game(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game       public.games%rowtype;
  v_booking    public.bookings%rowtype;
  v_redemption record;
  v_credit     integer;
  v_refunded   integer;
  v_paid       integer;
  v_pool       integer;
  v_count      integer := 0;
  -- ROUND 40 (Obchodní podmínky 11.3): seven more days, never fewer than
  -- seven from today.
  v_extension  interval := make_interval(days => public.cancelled_game_extension_days());
  v_floor      timestamptz := now() + make_interval(days => public.cancelled_game_extension_days());
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  -- Game lock only, as before: a cancellation touches every booking on the
  -- game, and each player's own lock is not needed to credit them.
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  if v_game.status not in ('draft', 'published', 'full') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  for v_booking in
    select * from public.bookings b
     where b.game_id = p_game_id and b.status in ('reserved', 'confirmed')
  loop
    -- Same credit rule as cancel_booking: a confirmed booking is fully
    -- accounted for; a reserved one returns only the credit already applied.
    if v_booking.status = 'confirmed' then
      v_credit := v_booking.price_czk;
    else
      v_credit := v_booking.credit_applied_czk;
    end if;

    update public.bookings
       set status = 'cancelled',
           cancel_lead_hours = round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2)
     where id = v_booking.id;

    v_refunded := 0;
    v_paid     := 0;
    v_pool     := 0;

    if v_credit > 0 then
      -- (a) Pass Credits: each comes back as a Credit of its own, valid seven
      -- days past the date it had. The rest of the pass keeps its date.
      for v_redemption in
        select -cl.delta_czk as amount_czk, b.expires_at
          from public.credit_ledger cl
          join public.credit_ledger b on b.id = cl.batch_id
         where cl.booking_id = v_booking.id
           and cl.reason = 'redemption'
           and cl.batch_id is not null
         order by cl.created_at, cl.id
      loop
        exit when v_refunded >= v_credit;
        insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, expires_at)
        values (v_booking.player_id, least(v_redemption.amount_czk, v_credit - v_refunded),
                'cancellation_credit', v_booking.id,
                greatest(v_redemption.expires_at + v_extension, v_floor));
        v_refunded := v_refunded + least(v_redemption.amount_czk, v_credit - v_refunded);
      end loop;

      -- (b) Paid money: a Credit bought on the day it was paid, plus seven.
      v_paid := case when v_booking.status = 'confirmed'
                     then greatest(v_booking.price_czk - v_booking.credit_applied_czk, 0)
                     else 0 end;
      v_paid := least(v_paid, v_credit - v_refunded);
      if v_paid > 0 then
        insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, expires_at)
        values (v_booking.player_id, v_paid, 'cancellation_credit', v_booking.id,
                greatest(public.booking_paid_at(v_booking.id)
                           + make_interval(days => public.credit_validity_days())
                           + v_extension,
                         v_floor));
      end if;

      -- (c) The unexpiring pool: credit bought before round 40 stays as it was.
      v_pool := v_credit - v_refunded - v_paid;
      if v_pool > 0 then
        insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
        values (v_booking.player_id, v_pool, 'cancellation_credit', v_booking.id);
      end if;

      insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
      values ('credit_issued', v_booking.player_id, p_game_id, v_booking.id,
              jsonb_build_object('amount_czk', v_credit, 'reason', 'game_cancelled',
                                 'returned_to_batches_czk', v_refunded,
                                 'paid_credit_czk', v_paid),
              v_game.city, v_game.brand);
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('booking_cancelled', v_booking.player_id, p_game_id, v_booking.id,
            jsonb_build_object('credit_issued_czk', v_credit, 'source', 'game_cancelled'),
            v_game.city, v_game.brand);

    v_count := v_count + 1;
  end loop;

  -- No spot_released here: a cancelled game has no spots to release.

  -- Clear the waitlist. Nobody is waiting for a game that will not happen, and
  -- leaving rows behind would have the notify sweep mailing them.
  delete from public.waitlist where game_id = p_game_id;

  update public.games set status = 'cancelled' where id = p_game_id;

  insert into public.events (event_type, game_id, metadata, city, brand)
  values ('game_cancelled', p_game_id,
          jsonb_build_object('bookings_cancelled', v_count), v_game.city, v_game.brand);

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. CONSENT RECORDS — Texty pro web 2.4
--
-- One row per tick: the player, the kind, the EXACT words shown, the language
-- they were shown in, the version of the terms, and the time. The waiver ticked
-- inside Stripe's form is written by the webhook (service role); everything a
-- player ticks on our own pages is written for the caller only.
-- -----------------------------------------------------------------------------

create table if not exists public.consent_records (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  kind          text not null
                check (kind in ('terms', 'terms_at_booking', 'marketing_opt_in',
                                'marketing_opt_out', 'withdrawal_waiver')),
  wording       text not null check (length(btrim(wording)) between 1 and 4000),
  locale        text not null check (locale in ('en', 'cs', 'ru', 'uk')),
  terms_version text not null check (length(btrim(terms_version)) between 1 and 40),
  context       jsonb not null default '{}'::jsonb,
  accepted_at   timestamptz not null default now()
);

create index if not exists consent_records_player_idx
  on public.consent_records (player_id, accepted_at desc);

alter table public.consent_records enable row level security;

drop policy if exists consent_records_select_own on public.consent_records;
create policy consent_records_select_own on public.consent_records
  for select to authenticated
  using (player_id = public.current_player_id());

-- READS ARE GRANTED EXPLICITLY — auto-expose is off here, and a missing grant
-- reads as empty rather than as an error. No client writes at all.
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;
grant select, insert on public.consent_records to service_role;

create or replace function public.record_consent(
  p_kind          text,
  p_wording       text,
  p_locale        text,
  p_terms_version text,
  p_context       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
  v_id     uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  -- A waiver is ticked inside Stripe's form; only the webhook can attest it.
  if p_kind is null or p_kind not in ('terms', 'terms_at_booking',
                                      'marketing_opt_in', 'marketing_opt_out') then
    raise exception 'CONSENT_KIND_INVALID' using detail = coalesce(p_kind, 'null');
  end if;
  if p_wording is null or btrim(p_wording) = '' then
    raise exception 'CONSENT_WORDING_REQUIRED';
  end if;

  insert into public.consent_records (player_id, kind, wording, locale, terms_version, context)
  values (v_player, p_kind, p_wording, p_locale, p_terms_version, coalesce(p_context, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.record_consent(text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_consent(text, text, text, text, jsonb) to authenticated;

create or replace function public.record_consent_for(
  p_player_id     uuid,
  p_kind          text,
  p_wording       text,
  p_locale        text,
  p_terms_version text,
  p_context       jsonb default '{}'::jsonb,
  p_accepted_at   timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'record_consent_for is called by the payment webhook only';
  end if;
  if p_wording is null or btrim(p_wording) = '' then
    raise exception 'CONSENT_WORDING_REQUIRED';
  end if;

  insert into public.consent_records
         (player_id, kind, wording, locale, terms_version, context, accepted_at)
  values (p_player_id, p_kind, p_wording, p_locale, p_terms_version,
          coalesce(p_context, '{}'::jsonb), coalesce(p_accepted_at, now()))
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.record_consent_for(uuid, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_consent_for(uuid, text, text, text, text, jsonb, timestamptz)
  to service_role;

-- -----------------------------------------------------------------------------
-- 7. app_capabilities() — RESTATED IN FULL, a superset of what was LIVE on
-- 2026-10-19 (28 flags, all true). Every flag for an object this file does not
-- create is a probe; `venueArchive`, hardcoded by round 39, becomes one too.
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
    -- Created by THIS file.
    'creditsSixtyDays',  true,
    'consentRecords',    true
  )
$$;

-- -----------------------------------------------------------------------------
-- 8. VERIFICATION — SHAPE ONLY. No row is written, no RPC that writes is run.
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps jsonb := public.app_capabilities();
  v_fn   text;
begin
  if public.credit_validity_days() <> 60
     or public.cancelled_game_extension_days() <> 7
     or public.cancellation_refund_cutoff_hours() <> 12 then
    raise exception 'round 40: a policy value is wrong';
  end if;

  if public.price_for_duration(60) <> public.credit_seat_price_czk()
     or public.price_for_duration(null) <> public.credit_seat_price_czk() then
    raise exception 'round 40: price_for_duration still prices by length';
  end if;

  foreach v_fn in array array['create_booking_internal', 'add_guests_with_credit',
                              'confirm_topup', 'cancel_booking', 'cancel_guests',
                              'settle_checkout_session', 'cancel_game'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = v_fn
                      and p.prosrc like '%ROUND 40%') then
      raise exception 'round 40: public.% does not carry round 40', v_fn;
    end if;
  end loop;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'credit_seat_minutes') then
    raise exception 'round 40: credit_seat_minutes() still exists';
  end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'consent_records'
                    and c.relrowsecurity) then
    raise exception 'round 40: consent_records is missing or has no RLS';
  end if;

  if not has_table_privilege('authenticated', 'public.consent_records', 'select')
     or has_table_privilege('authenticated', 'public.consent_records', 'insert') then
    raise exception 'round 40: consent_records grants are wrong';
  end if;

  if (select count(*) from jsonb_object_keys(v_caps)) <> 30
     or exists (select 1 from jsonb_each(v_caps) where value <> 'true'::jsonb) then
    raise exception 'round 40: app_capabilities is not the 28 live flags plus two, all true: %', v_caps;
  end if;
end $$;
