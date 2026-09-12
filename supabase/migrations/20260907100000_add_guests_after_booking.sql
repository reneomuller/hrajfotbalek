-- =============================================================================
-- ROUND 27, ITEM 2 — ADD GUESTS AFTER BOOKING.
--
-- A player who has already paid for their spot can bring somebody. Until now
-- the only moment to say so was the booking form: choose your party, pay once,
-- done. Deciding on Thursday that a friend is coming meant cancelling and
-- rebooking, which is a refund, a race for the seat, and a worse product.
--
-- THE SHAPE IS PAY-FIRST'S, RE-USED RATHER THAN RE-INVENTED (round 26, item 1).
-- No seat is held by an intention. The guests appear on the roster when the
-- money has arrived — either from the wallet, atomically, or from the webhook
-- under the game's advisory lock — and never before. Everything that made
-- pay-first safe applies unchanged: the same register, the same active expiry,
-- the same credit-in-full for money that arrives after the last seat went.
--
-- WHAT IS DELIBERATELY NOT HERE:
--
--   * No new "pending guests" state. That is the machinery round 26 deleted,
--     and re-introducing it for a smaller case would re-introduce every defect
--     it caused.
--   * No cash-out. A game that fills while somebody is paying for guests pays
--     back in CREDIT, which is ruling O's refund-in-kind and the only refund
--     path this product has (SCOPE.md quarantines the other half).
--   * No separate guest row. Guests are `bookings.guest_count`, expanded by
--     the roster view — so "<Name>'s Guest N" numbering CONTINUES from the
--     player's existing guests for free, because the view numbers with
--     `generate_series(1, guest_count)` and the count simply got bigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The register learns a second kind of checkout
--
-- ONE TABLE, NOT TWO. An add-guest checkout is the same object as a booking
-- checkout in every way that matters to the machinery around it: it is opened
-- when a form goes on screen, it must be killable at Stripe when the game
-- fills, and it is settled once by a webhook that may deliver twice. Splitting
-- it would mean teaching `checkouts_to_expire`, `mark_checkout_expired`,
-- `checkout_outcome` and `recent_checkout` about two tables to gain nothing.
--
-- `game_id` STAYS POPULATED FOR BOTH, which is what lets active expiry keep
-- working with no change at all: it selects on `game_id` and `status`, and an
-- add-guest session is as dead as a booking session when the pitch is full.
-- -----------------------------------------------------------------------------
alter table public.checkout_sessions
  add column if not exists kind text not null default 'booking';

alter table public.checkout_sessions
  add column if not exists target_booking_id uuid
    references public.bookings(id) on delete cascade;

alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_kind_catalog;
alter table public.checkout_sessions
  add constraint checkout_sessions_kind_catalog
  check (kind in ('booking', 'add_guests'));

/*
 * AN ADD-GUEST SESSION MUST NAME THE BOOKING IT EXTENDS, and a plain booking
 * session must not. Stated as a constraint rather than trusted to the two
 * functions that write the table: a row with `kind = 'add_guests'` and a null
 * target is one the settler cannot act on, and the place to refuse it is here.
 */
alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_target_matches_kind;
alter table public.checkout_sessions
  add constraint checkout_sessions_target_matches_kind
  check (
    (kind = 'add_guests' and target_booking_id is not null)
    or (kind = 'booking' and target_booking_id is null)
  );

comment on column public.checkout_sessions.kind is
  'booking = pay-first, creates the booking. add_guests = extends an existing '
  'paid booking; guest_count is the ADDED guests, not the total.';

-- -----------------------------------------------------------------------------
-- 2. The event catalog widens, IN THIS MIGRATION
--
-- CLAUDE.md records this as already missed once: a migration that emits a new
-- event type and forgets the CHECK fails at the first WRITE, naming a
-- constraint that has nothing to do with the feature. Postgres cannot extend a
-- CHECK in place, so this is a drop and re-add restating the list in full —
-- pre-approved (2026-08-01) as long as the new list is a strict superset.
--
-- `booking_guests_added` is the only new member. It is NOT `game_guests_changed`
-- — that one is the ADMIN adding house guests to a pitch, which is a different
-- act by a different person against a different row.
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
    'venue_deleted',
    -- Round 27, item 2.
    'booking_guests_added'
  )
);

-- -----------------------------------------------------------------------------
-- 3. can_add_guests — one answer, read by the panel and by both writers
--
-- THE PANEL ASKS IT TO DECIDE WHETHER TO RENDER AT ALL, and the two writers
-- ask it again under a lock. That is the same split as everywhere else here:
-- this bounds the CONTROL, the lock decides the truth.
-- -----------------------------------------------------------------------------
create or replace function public.can_add_guests(p_booking_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_free    integer;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then return 0; end if;

  -- OWN BOOKING ONLY. The id travels in a form field, so ownership is checked
  -- here rather than assumed from the page that rendered the panel.
  if v_booking.player_id is distinct from public.current_player_id()
     and not (public.is_admin_caller() or public.is_service_role()) then
    return 0;
  end if;

  /*
   * A PAID BOOKING ONLY, and `confirmed` is the whole of that test under
   * pay-first: an online booking is born confirmed because the money arrived
   * first, and a legacy `reserved` row is somebody who has not paid yet.
   * Letting an unpaid booking buy guests would be selling a second thing to
   * somebody who has not settled the first.
   */
  if v_booking.status <> 'confirmed' then return 0; end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;
  if v_game.status not in ('published', 'full') then return 0; end if;

  -- Nobody adds a guest to a game that has kicked off.
  if v_game.starts_at <= now() then return 0; end if;

  v_free := v_game.capacity - public.game_seats_taken(v_booking.game_id);
  if v_free < 0 then v_free := 0; end if;

  -- The party ceiling is the policy's, counted across guests this booking
  -- ALREADY has: three is three, not three more each time.
  return least(v_free, greatest(0, 3 - v_booking.guest_count));
end;
$$;

revoke execute on function public.can_add_guests(uuid) from public;
grant execute on function public.can_add_guests(uuid) to authenticated, service_role;

comment on function public.can_add_guests(uuid) is
  'How many further guests this booking may add right now: bounded by free '
  'seats and by the party ceiling counted across guests already held.';

-- -----------------------------------------------------------------------------
-- 4. add_guests_with_credit — the wallet path, atomic
--
-- ONE TRANSACTION, ONE LOCK ORDER (player then game, same as everywhere else).
-- The balance is read, the seats are checked and the guests are added inside
-- it, so there is no window in which a player spends credit for a seat that
-- somebody else took a millisecond earlier.
--
-- IT IS AN EXPLICIT CHOICE AND NEVER A FALLBACK. Nothing in this file spends
-- the wallet unless the player pressed the credit button — which is the same
-- rule round 27 item 1 made a spec of for the booking form.
-- -----------------------------------------------------------------------------
create or replace function public.add_guests_with_credit(
  p_booking_id  uuid,
  p_guest_count integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_player  uuid;
  v_room    integer;
  v_cost    integer;
  v_balance integer;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player';
  end if;

  if p_guest_count is null or p_guest_count < 1 then
    raise exception 'INVALID_GUEST_COUNT';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found or v_booking.player_id <> v_player then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'not your booking';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_player::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  -- Re-read everything under the lock; the panel's numbers are a snapshot.
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games   g where g.id = v_booking.game_id;

  v_room := public.can_add_guests(p_booking_id);
  if p_guest_count > v_room then
    raise exception 'CAPACITY_FULL'
      using detail = 'only ' || v_room::text || ' further guest(s) fit';
  end if;

  v_cost := v_game.price_czk * p_guest_count;

  select coalesce(sum(delta_czk), 0) into v_balance
    from public.credit_ledger where player_id = v_player;

  if v_balance < v_cost then
    raise exception 'CREDIT_NEGATIVE_BLOCKED'
      using detail = 'balance ' || v_balance::text || ' < ' || v_cost::text;
  end if;

  insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
       values (v_player, -v_cost, 'redemption', p_booking_id);

  update public.bookings
     set guest_count        = guest_count + p_guest_count,
         price_czk          = price_czk + v_cost,
         credit_applied_czk = credit_applied_czk + v_cost
   where id = p_booking_id;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_guests_added', v_player, v_booking.game_id, p_booking_id,
          jsonb_build_object('added', p_guest_count, 'paid_czk', v_cost,
                             'rail', 'credit'),
          v_game.city, v_game.brand);

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('credit_redeemed', v_player, v_booking.game_id, p_booking_id,
          jsonb_build_object('amount_czk', v_cost, 'reason', 'add_guests'),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);
  return 'added';
end;
$$;

revoke execute on function public.add_guests_with_credit(uuid, integer) from public;
grant execute on function public.add_guests_with_credit(uuid, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. open_add_guests_checkout — the register entry for the online path
-- -----------------------------------------------------------------------------
create or replace function public.open_add_guests_checkout(
  p_booking_id        uuid,
  p_guest_count       integer,
  p_stripe_session_id text,
  p_amount_czk        integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_player  uuid;
  v_id      uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found or v_booking.player_id <> v_player then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'not your booking';
  end if;

  if p_guest_count is null or p_guest_count < 1
     or p_guest_count > public.can_add_guests(p_booking_id) then
    raise exception 'CAPACITY_FULL';
  end if;

  insert into public.checkout_sessions
         (stripe_session_id, game_id, player_id, guest_count, amount_czk,
          kind, target_booking_id)
       values (p_stripe_session_id, v_booking.game_id, v_player,
               p_guest_count, p_amount_czk, 'add_guests', p_booking_id)
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.open_add_guests_checkout(uuid, integer, text, integer) from public;
grant execute on function public.open_add_guests_checkout(uuid, integer, text, integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. settle_checkout_session — one settler, two kinds
--
-- RESTATED IN FULL rather than patched, because it is one decision procedure
-- and reading half of it in this file and half in round 26's would be the
-- thing that lets the two shapes drift.
-- -----------------------------------------------------------------------------
create or replace function public.settle_checkout_session(
  p_stripe_session_id text,
  p_amount_czk        integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.checkout_sessions%rowtype;
  v_game    public.games%rowtype;
  v_target  public.bookings%rowtype;
  v_seats   integer;
  v_wanted  integer;
  v_booking uuid;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'settle_checkout_session is called by the webhook';
  end if;

  select * into v_session
    from public.checkout_sessions
   where stripe_session_id = p_stripe_session_id;

  if not found then
    return 'unknown';
  end if;

  if v_session.status <> 'open' then
    return 'already';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Same as `cancel_booking`. ===
  perform pg_advisory_xact_lock(hashtextextended(v_session.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_session.game_id::text, 0));

  select * into v_session
    from public.checkout_sessions where id = v_session.id;
  if v_session.status <> 'open' then
    return 'already';
  end if;

  select * into v_game from public.games g where g.id = v_session.game_id;

  /*
   * HOW MANY SEATS THIS PAYMENT IS ASKING FOR, and it is the ONE place the two
   * kinds differ arithmetically: a booking wants the player plus their guests;
   * an add-guest payment wants only the guests, because the player is already
   * counted by the booking being extended.
   */
  v_wanted := case when v_session.kind = 'add_guests'
                   then v_session.guest_count
                   else 1 + v_session.guest_count end;
  v_seats  := public.game_seats_taken(v_session.game_id);

  if v_game.status in ('published', 'full')
     and v_seats + v_wanted <= v_game.capacity then

    if v_session.kind = 'add_guests' then
      select * into v_target
        from public.bookings b where b.id = v_session.target_booking_id;

      /*
       * THE BOOKING MUST STILL BE THERE AND STILL BE PAID. Somebody can cancel
       * between opening the form and paying — rare, but the money has already
       * moved by the time we find out, so it takes the credit path rather than
       * an error. Extending a cancelled booking would put guests on the roster
       * belonging to a player who is not coming.
       */
      if found and v_target.status = 'confirmed' then
        update public.bookings
           set guest_count = guest_count + v_session.guest_count,
               price_czk   = price_czk + p_amount_czk
         where id = v_target.id;

        insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
        values ('booking_guests_added', v_session.player_id, v_session.game_id,
                v_target.id,
                jsonb_build_object('added', v_session.guest_count,
                                   'paid_czk', p_amount_czk, 'rail', 'checkout'),
                v_game.city, v_game.brand);

        insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
        values ('payment_confirmed', v_session.player_id, v_session.game_id,
                v_target.id,
                jsonb_build_object('amount_czk', p_amount_czk,
                                   'session', p_stripe_session_id),
                v_game.city, v_game.brand);

        update public.checkout_sessions
           set status = 'booked', booking_id = v_target.id, settled_at = now()
         where id = v_session.id;

        perform public.sync_game_fullness(v_session.game_id);
        return 'booked';
      end if;

    else
      insert into public.bookings
             (game_id, player_id, status, payment_method, price_czk,
              credit_applied_czk, guest_count, stripe_session_id)
           values (v_session.game_id, v_session.player_id, 'confirmed', 'qr',
                   v_session.amount_czk, 0, v_session.guest_count,
                   p_stripe_session_id)
        returning id into v_booking;

      insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
      values ('booking_created', v_session.player_id, v_session.game_id, v_booking,
              jsonb_build_object('seats', v_wanted, 'paid_czk', p_amount_czk,
                                 'rail', 'checkout'),
              v_game.city, v_game.brand);

      insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
      values ('payment_confirmed', v_session.player_id, v_session.game_id, v_booking,
              jsonb_build_object('amount_czk', p_amount_czk,
                                 'session', p_stripe_session_id),
              v_game.city, v_game.brand);

      update public.checkout_sessions
         set status = 'booked', booking_id = v_booking, settled_at = now()
       where id = v_session.id;

      perform public.sync_game_fullness(v_session.game_id);
      return 'booked';
    end if;
  end if;

  /*
   * NO SEAT. THE MONEY BECOMES CREDIT, IN FULL — and this is now the ending
   * for a vanished booking as well as for a full pitch. Both are "we cannot
   * give you what you paid for", and both pay back the same way.
   */
  insert into public.credit_ledger (player_id, delta_czk, reason)
       values (v_session.player_id, p_amount_czk, 'cancellation_credit');

  insert into public.events (event_type, player_id, game_id, metadata, city, brand)
  values ('credit_issued', v_session.player_id, v_session.game_id,
          jsonb_build_object('amount_czk', p_amount_czk,
                             'reason', 'checkout_game_full',
                             'kind', v_session.kind,
                             'session', p_stripe_session_id),
          v_game.city, v_game.brand);

  perform public.notify_player(
    v_session.player_id,
    case when v_session.kind = 'add_guests'
         then 'The game filled before your guests were added'
         else 'The game filled while you were paying' end,
    case when v_session.kind = 'add_guests'
         then 'Your payment arrived just after the last spot went, so your '
           || 'guests could not be added. The full amount is in your wallet as '
           || 'credit and applies to your next booking automatically.'
         else 'Your payment arrived just after the last spot went. The full '
           || 'amount is in your wallet as credit and applies to your next '
           || 'booking automatically.' end,
    'checkout_game_full',
    null);

  update public.checkout_sessions
     set status           = 'credited',
         settled_at       = now(),
         attention_at     = now(),
         attention_reason = 'paid ' || p_amount_czk::text
                         || ' CZK for ' || v_session.kind
                         || ' after the game filled — credited in full',
         booking_id       = null
   where id = v_session.id;

  return 'credited';
end;
$$;

revoke execute on function public.settle_checkout_session(text, integer) from public;
grant execute on function public.settle_checkout_session(text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 7. checkout_outcome gains `kind`, so the return page can route
--
-- DROP AND RECREATE: the return type changes, and `create or replace` cannot
-- do that. Both callers move with it in the same change.
-- -----------------------------------------------------------------------------
drop function if exists public.checkout_outcome(text);

create function public.checkout_outcome(p_stripe_session_id text)
returns table (status text, game_id uuid, booking_id uuid, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select cs.status, cs.game_id, cs.booking_id, cs.kind
    from public.checkout_sessions cs
   where cs.stripe_session_id = p_stripe_session_id
     and cs.player_id = public.current_player_id();
$$;

revoke execute on function public.checkout_outcome(text) from public;
grant execute on function public.checkout_outcome(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. The capability flag
--
-- Restated in full, so applying this migration alone cannot switch another
-- feature off.
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
    'addGuestsAfterBooking',  true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — SHAPE ONLY
--
-- THIS BLOCK MAY NOT WRITE A ROW, AND THE REASON COST A PRODUCTION CLEANUP.
--
-- Migrations used to end with a behavioural DRILL: build a fixture, exercise
-- the new RPCs, assert the outcome. Every one of them was validated inside
-- `begin; … rollback;`, so the fixtures vanished on every test run — and
-- `scripts/apply-migration.mjs` COMMITS. On 2026-09-12 round 29's drill was
-- applied to production and left behind a fake venue, two fake games, two
-- bookings against a real player, a real "you were marked as a no-show"
-- notification in his bell, two games' worth of inflated stats, 150 CZK of
-- phantom money owed, and a game the nightly sweep would have reported as
-- needing attention every night for ever.
--
-- SO THE RULE IS: a migration asserts that the SHAPE it created exists —
-- objects, columns, constraints, grants, capability flags. It never inserts,
-- never updates, never calls an RPC that writes. Behaviour is drilled in
-- `supabase/tests/`, where `run.mjs` wraps every suite in `begin; … rollback;`
-- BY DESIGN and a committing drill is structurally impossible.
--
-- See CLAUDE.md, "A migration's verification block may not write a row".
-- -----------------------------------------------------------------------------

do $$
declare v_fn text;
begin
  if coalesce((public.app_capabilities() ->> 'addGuestsAfterBooking')::boolean, false) is not true then
    raise exception 'add guests: the capability flag did not turn on';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='checkout_sessions'
                    and column_name='kind') then
    raise exception 'add guests: checkout_sessions.kind is missing';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='checkout_sessions'
                    and column_name='target_booking_id') then
    raise exception 'add guests: checkout_sessions.target_booking_id is missing';
  end if;

  if not exists (select 1 from pg_constraint
                  where conname='checkout_sessions_kind_catalog') then
    raise exception 'add guests: the kind catalog constraint is missing';
  end if;

  if not exists (select 1 from pg_constraint
                  where conname='checkout_sessions_target_matches_kind') then
    raise exception 'add guests: the target-matches-kind constraint is missing';
  end if;

  -- THE EVENT CATALOG, which is the trap CLAUDE.md records as already missed
  -- once: a new event type that fails at the first WRITE, not at the migration.
  if pg_get_constraintdef((select oid from pg_constraint
                            where conname='events_event_type_catalog'))
     not like '%booking_guests_added%' then
    raise exception 'add guests: the event catalog was not widened';
  end if;

  for v_fn in select unnest(array['can_add_guests','add_guests_with_credit',
                                  'open_add_guests_checkout','settle_checkout_session',
                                  'checkout_outcome'])
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname=v_fn) then
      raise exception 'add guests: % is missing', v_fn;
    end if;
  end loop;

  if pg_get_function_result((select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' and p.proname='checkout_outcome'))
     not like '%kind%' then
    raise exception 'add guests: checkout_outcome does not project kind';
  end if;

  raise notice 'add guests: shape verified — behaviour is drilled in supabase/tests/add_guests_after_booking.sql';
end $$;
