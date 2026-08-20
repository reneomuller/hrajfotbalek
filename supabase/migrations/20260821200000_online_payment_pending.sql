-- =============================================================================
-- Round 12 item 5 — an online booking is PENDING until Stripe says otherwise
--
-- THE HOLE THIS CLOSES. Choosing "Online payment" created a booking, then
-- redirected to a Stripe Payment Link. The booking held its seats from the
-- moment it was created — before Stripe had seen a single koruna — so a player
-- who pressed the browser's back arrow kept the spot, unpaid, forever. Nothing
-- expired it: `expires_at` is only ever set by the nudge sweep, which runs
-- twelve hours out. On a full game that is a seat nobody can book and nobody
-- has paid for.
--
-- NO NEW BOOKING STATUS, AND THAT IS DELIBERATE. A pending booking is
-- `reserved`, which already means "holds a spot, has not paid" — every reader
-- in the product, the admin unpaid list included, is already correct about it.
-- Adding a fifth enum value would have meant auditing `status in (...)` at
-- thirty-odd call sites to answer a question they have all already answered.
--
-- WHAT IS NEW IS A CLOCK. `payment_pending_at` marks a booking as waiting on
-- an online payment, and after `ONLINE_PAYMENT_WINDOW` it stops holding seats.
-- It does not change status, is not swept by cron, and needs no scheduler: the
-- seat count simply stops counting it. A stale pending is invisible to
-- everyone except its owner, who is told it expired and offered a retry.
--
-- THE EDGE THE OWNER NAMED. Money can arrive after the window, on a game that
-- has since filled. There is then no seat to give and the payment is real, so
-- the booking is flagged `payment_attention_at` and surfaced in admin for
-- manual resolution. It is never silently seated and never silently dropped.
--
-- CASH AND CREDIT ARE UNTOUCHED. Neither sets `payment_pending_at`, so neither
-- is affected by any line below. `qr` is untouched too — the bank-QR rail is
-- R3's substrate and a player's bank transfer takes days, not thirty minutes.
-- Only a booking created through the ONLINE option is marked, which is why
-- `p_online` is an explicit argument rather than inferred from the method.
--
-- Rollback: supabase/rollback/20260821200000_online_payment_pending_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------

alter table public.bookings
  add column payment_pending_at      timestamptz,
  add column stripe_session_id       text,
  add column payment_attention_at    timestamptz,
  add column payment_attention_reason text;

-- IDEMPOTENCY IS A UNIQUE INDEX, not a code path. Stripe retries a webhook
-- until it gets a 2xx and may deliver the same event more than once anyway;
-- the handler checks this column first, and if two deliveries ever race past
-- that check the index refuses the second write rather than confirming twice.
create unique index bookings_stripe_session_id_key
  on public.bookings (stripe_session_id)
  where stripe_session_id is not null;

-- The admin queue reads this, and it is expected to be empty almost always.
create index bookings_payment_attention_idx
  on public.bookings (payment_attention_at)
  where payment_attention_at is not null;

comment on column public.bookings.payment_pending_at is
  'Set when an ONLINE booking is created; cleared when Stripe confirms it. '
  'After online_payment_window() the booking stops holding seats without '
  'changing status. Null for cash, credit and bank-QR bookings.';

comment on column public.bookings.stripe_session_id is
  'The checkout session that paid this booking. Uniquely indexed: it is what '
  'makes webhook redelivery a no-op.';

comment on column public.bookings.payment_attention_reason is
  'Why a payment could not be seated automatically — money arrived and no seat '
  'could be given. Resolved by hand; never resolved by a sweep.';

-- -----------------------------------------------------------------------------
-- 2. The window, and the one definition of "this booking holds a seat"
-- -----------------------------------------------------------------------------

create function public.online_payment_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 minutes'; $$;

comment on function public.online_payment_window() is
  'How long an unpaid ONLINE booking holds its seats. Mirrored display-only in '
  'lib/policy.ts as policy.booking.onlinePaymentMinutes; THIS is the authority.';

/*
 * A seat is live when the booking is active AND it is not an online payment
 * that has run out of time.
 *
 * ONE DEFINITION, THREE CALLERS — `game_seats_taken` and both branches of
 * `game_roster_public`. The failure it prevents is the invisible one this
 * codebase keeps meeting: a seat counted in one place and not another shows a
 * game as full while the roster lists eleven of twelve, and nothing errors.
 *
 * `confirmed` short-circuits deliberately. A confirmed booking holds its seat
 * whatever `payment_pending_at` says, so a webhook that confirms without
 * clearing the column cannot un-seat a player who has paid.
 */
create function public.booking_holds_seat(
  p_status     public.booking_status,
  p_pending_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('reserved', 'confirmed')
     and (
       p_status = 'confirmed'
       or p_pending_at is null
       or p_pending_at >= now() - public.online_payment_window()
     );
$$;

revoke execute on function public.online_payment_window() from public;
revoke execute on function public.booking_holds_seat(public.booking_status, timestamptz) from public;

/*
 * BOTH GRANTED TO `anon`, AND THE WINDOW IS THE ONE THAT MATTERS.
 *
 * `booking_holds_seat` is SECURITY INVOKER and calls `online_payment_window`,
 * so a caller needs EXECUTE on BOTH or the call fails at the inner one. That
 * caller includes `anon`, because `game_roster_public` is the anonymous read
 * path and its WHERE clause is this predicate.
 *
 * Granting only the outer function was the first version of this migration,
 * and it failed exactly where CLAUDE.md says a missing grant fails: not at the
 * migration, but at the first read — as "permission denied for function
 * online_payment_window" from a page that had simply asked who was playing.
 *
 * Neither function reads a row. `online_payment_window` returns a constant and
 * `booking_holds_seat` is arithmetic over two arguments the caller already
 * holds, so exposing them to `anon` publishes nothing.
 */
grant execute on function public.online_payment_window()
  to anon, authenticated, service_role;
grant execute on function public.booking_holds_seat(public.booking_status, timestamptz)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Seat counting stops counting a stale pending
-- -----------------------------------------------------------------------------

create or replace function public.game_seats_taken(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select g.guest_count from public.games g where g.id = p_game_id), 0)
  + coalesce((
      select sum(1 + b.guest_count)::integer
        from public.bookings b
       where b.game_id = p_game_id
         and public.booking_holds_seat(b.status, b.payment_pending_at)
    ), 0);
$$;

-- -----------------------------------------------------------------------------
-- 4. The roster stops showing a stale pending's seats
-- -----------------------------------------------------------------------------

drop view public.game_roster_public;

create view public.game_roster_public as
  select
    b.game_id,
    p.nickname,
    p.photo_path,
    (
      select count(*)
        from public.bookings b2
        join public.games g2 on g2.id = b2.game_id
       where b2.player_id = p.id
         and b2.status in ('reserved', 'confirmed')
         and g2.status in ('played', 'settled')
    )::integer                as games_played,
    (p.auth_user_id is null)  as is_guest,
    null::text                as guest_of,
    null::integer             as guest_index
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games   g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and public.booking_holds_seat(b.status, b.payment_pending_at)

  union all

  select
    b.game_id,
    null::text,
    null::text,
    0,
    true,
    p.nickname,
    seat::integer
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games   g on g.id = b.game_id
  cross join lateral generate_series(1, b.guest_count) as seat
  where g.status in ('published', 'full', 'played', 'settled')
    and public.booking_holds_seat(b.status, b.payment_pending_at)
    and b.guest_count > 0

  union all

  select
    g.id,
    null::text,
    null::text,
    0,
    true,
    null::text,
    seat::integer
  from public.games g
  cross join lateral generate_series(1, g.guest_count) as seat
  where g.status in ('published', 'full', 'played', 'settled')
    and g.guest_count > 0;

-- `drop view` takes the grants with it, and Supabase answers a missing grant
-- with an empty set rather than an error — so without this every game on the
-- site would show zero players.
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface, ONE ROW PER SEAT. Projects game_id, nickname, '
  'photo_path, games_played, is_guest, guest_of and guest_index — never '
  'player_id, email, phone or booking status. A booking awaiting an online '
  'payment stops appearing once its window closes (booking_holds_seat).';

-- -----------------------------------------------------------------------------
-- 5. create_booking learns which bookings are waiting on Stripe
--
-- The signature gains a parameter, so this is a DROP and a re-create.
--
-- `p_online` IS EXPLICIT RATHER THAN INFERRED FROM THE METHOD, and that is the
-- whole reason the parameter exists. The online option books onto the `qr`
-- rail (ruling R3 — it is the substrate Stripe maps onto), but so does a bank
-- transfer, and a bank transfer takes days. Expiring every `qr` booking after
-- thirty minutes would break the payment rail R3 forbids touching.
-- -----------------------------------------------------------------------------

drop function if exists public.create_booking(uuid, public.payment_method, uuid, uuid, integer);
drop function if exists public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean, integer);

create function public.create_booking_internal(
  p_game_id          uuid,
  p_player_id        uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid,
  p_booked_by_admin  boolean,
  p_guest_count      integer default 0,
  p_online           boolean default false
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- THE PARTY CEILING, RESTATED FROM `lib/policy.ts`. SQL cannot read a
  -- TypeScript module, so this is one of three policy windows that exist in
  -- two places. THIS is the authority; a route guard is skipped by curl.
  v_max_guests constant integer := 3;

  v_game            public.games%rowtype;
  v_player          public.players%rowtype;
  v_taken           integer;
  v_seats           integer;
  v_balance         integer;
  v_price           integer;
  v_credit_applied  integer;
  v_amount_due      integer;
  v_method          public.payment_method;
  v_status          public.booking_status;
  v_payment_code    bigint;
  v_booking_id      uuid;
  v_pending_at      timestamptz;
  v_waitlist        public.waitlist%rowtype;
  v_result          public.booking_result;
begin
  if p_payment_method is null or p_payment_method not in ('qr', 'cash') then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'payment_method must be qr or cash; credit and seed_free are derived';
  end if;

  if p_guest_count is null or p_guest_count < 0 then
    raise exception 'INVALID_GUEST_COUNT';
  end if;

  if p_guest_count > v_max_guests then
    raise exception 'PARTY_TOO_LARGE'
      using detail = 'at most ' || v_max_guests::text || ' guests per booking';
  end if;

  v_seats := 1 + p_guest_count;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_player from public.players p where p.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  if v_game.status not in ('published', 'full') then
    raise exception 'GAME_NOT_BOOKABLE'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  if v_game.starts_at <= now() then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  if exists (
    select 1 from public.bookings b
     where b.game_id = p_game_id
       and b.player_id = p_player_id
       and b.status in ('reserved', 'confirmed')
  ) then
    raise exception 'DUPLICATE_ACTIVE_BOOKING';
  end if;

  -- Capacity in SEATS. The whole party fits or none of it does.
  v_taken := public.game_seats_taken(p_game_id);

  if v_taken + v_seats > v_game.capacity then
    raise exception 'CAPACITY_FULL'
      using detail = 'seats taken ' || v_taken::text
                  || ', requested ' || v_seats::text
                  || ', capacity ' || v_game.capacity::text;
  end if;

  v_price := v_game.price_czk * v_seats;

  if v_player.is_seed then
    v_method         := 'seed_free';
    v_price          := 0;
    v_credit_applied := 0;
    v_amount_due     := 0;
    v_payment_code   := null;
    v_status         := 'confirmed';
  else
    select coalesce(sum(cl.delta_czk), 0) into v_balance
      from public.credit_ledger cl
     where cl.player_id = p_player_id;

    v_credit_applied := least(greatest(v_balance, 0), v_price);
    v_amount_due     := v_price - v_credit_applied;

    if v_balance - v_credit_applied < 0 then
      raise exception 'CREDIT_NEGATIVE_BLOCKED';
    end if;

    if v_credit_applied = v_price and v_price > 0 then
      v_method := 'credit';
    else
      v_method := p_payment_method;
    end if;

    if v_amount_due = 0 then
      v_status       := 'confirmed';
      v_payment_code := null;
    else
      v_status := 'reserved';
      if v_method = 'qr' then
        v_payment_code := public.next_payment_code();
      else
        v_payment_code := null;
      end if;
    end if;
  end if;

  /*
   * THE CLOCK STARTS ONLY IF THERE IS SOMETHING TO WAIT FOR.
   *
   * A wallet that covered the whole party comes back `credit` and `confirmed`
   * — nothing is owed, so nothing is pending, and stamping it would expire a
   * paid seat after thirty minutes. Same for a seed booking. The condition is
   * the derived outcome, never the caller's intent.
   */
  if p_online and v_status = 'reserved' then
    v_pending_at := now();
  else
    v_pending_at := null;
  end if;

  insert into public.bookings (
    game_id, player_id, status, payment_method, payment_code,
    price_czk, credit_applied_czk, is_seed, booked_by_admin, guest_count,
    payment_pending_at
  ) values (
    p_game_id, p_player_id, v_status, v_method, v_payment_code,
    v_price, v_credit_applied, v_player.is_seed, p_booked_by_admin, p_guest_count,
    v_pending_at
  ) returning id into v_booking_id;

  if v_credit_applied > 0 then
    if public.apply_credit(p_player_id, v_booking_id, v_credit_applied) <> v_credit_applied then
      raise exception 'CREDIT_ALLOCATION_MISMATCH'
        using detail = 'batch allocation did not cover the applied credit';
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_redeemed', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('amount_czk', v_credit_applied), v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_created', p_player_id, p_game_id, v_booking_id,
          jsonb_build_object(
            'payment_method', v_method,
            'price_czk', v_price,
            'credit_applied_czk', v_credit_applied,
            'amount_due_czk', v_amount_due,
            'guest_count', p_guest_count,
            'seats', v_seats,
            'awaiting_online_payment', v_pending_at is not null,
            'booked_by_admin', p_booked_by_admin),
          v_game.city, v_game.brand);

  if v_status = 'confirmed' then
    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('payment_confirmed', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('method', v_method, 'amount_czk', 0),
            v_game.city, v_game.brand);
  end if;

  if p_from_waitlist_id is not null then
    select * into v_waitlist from public.waitlist w where w.id = p_from_waitlist_id;
    if not found then
      raise exception 'WAITLIST_ENTRY_NOT_FOUND';
    end if;
    if v_waitlist.player_id <> p_player_id or v_waitlist.game_id <> p_game_id then
      raise exception 'INSUFFICIENT_PERMISSION'
        using detail = 'waitlist entry does not belong to this player and game';
    end if;

    update public.waitlist
       set converted_booking_id = v_booking_id
     where id = p_from_waitlist_id;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('waitlist_converted', p_player_id, p_game_id, v_booking_id,
            jsonb_build_object('waitlist_id', p_from_waitlist_id),
            v_game.city, v_game.brand);
  end if;

  perform public.sync_game_fullness(p_game_id);

  v_result := (v_booking_id, v_status, v_method, v_payment_code,
               v_price, v_credit_applied, v_amount_due)::public.booking_result;
  return v_result;
end;
$$;

revoke execute on function
  public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean, integer, boolean)
  from public;

create function public.create_booking(
  p_game_id          uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid default null,
  p_player_id        uuid default null,
  p_guest_count      integer default 0,
  p_online           boolean default false
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  v_player_id := public.current_player_id();

  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  if p_player_id is not null and p_player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'create_booking books only for the calling player';
  end if;

  return public.create_booking_internal(
    p_game_id, v_player_id, p_payment_method, p_from_waitlist_id, false,
    p_guest_count, p_online);
end;
$$;

revoke execute on function
  public.create_booking(uuid, public.payment_method, uuid, uuid, integer, boolean) from public;
grant execute on function
  public.create_booking(uuid, public.payment_method, uuid, uuid, integer, boolean)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. confirm_online_payment — everything the webhook is allowed to decide
--
-- THE HANDLER DECIDES NOTHING. It verifies a signature, parses a session, and
-- calls this. Every question that matters — is this a redelivery, did enough
-- money arrive, is there still a seat — is answered here, under the game's
-- advisory lock, where a concurrent booking cannot slip between the check and
-- the write.
--
-- Returns one of, and the handler maps each to a 200:
--   'confirmed' — seated and paid
--   'already'   — this exact session already resolved this booking; no-op
--   'attention' — money arrived and no seat could be given; flagged for a human
--   'unknown'   — no such booking
-- -----------------------------------------------------------------------------

create function public.confirm_online_payment(
  p_booking_id  uuid,
  p_session_id  text,
  p_amount_czk  integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_seats   integer;
  v_taken   integer;
  v_reason  text;
begin
  -- Service role only. This is not an admin surface: it exists for one caller,
  -- the webhook route, which holds the service key and nothing else does.
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'confirm_online_payment is called by the Stripe webhook only';
  end if;

  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'INVALID_SESSION';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    -- An unknown reference is NOT an error. A Payment Link can be opened by
    -- anyone with the URL, and a test event carries a reference that never
    -- existed here. The handler logs it and answers 200; raising would make
    -- Stripe retry something that can never succeed.
    return 'unknown';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));
  select * into v_booking from public.bookings b where b.id = p_booking_id;

  -- IDEMPOTENCY, FIRST AND BY VALUE. Same session, same booking, already done.
  if v_booking.stripe_session_id is not distinct from p_session_id then
    return 'already';
  end if;

  -- A DIFFERENT session paying an already-paid booking is money we did not
  -- expect, not a redelivery. It goes to a human rather than being absorbed.
  if v_booking.stripe_session_id is not null then
    v_reason := 'a second checkout session paid a booking already settled by '
             || v_booking.stripe_session_id;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;
  v_seats := 1 + v_booking.guest_count;

  /*
   * AMOUNT FIRST, AND `>=` RATHER THAN `=`.
   *
   * The owner may enable "adjustable quantity" on the Payment Link, in which
   * case the player sets the quantity themselves and `amount_total` is
   * whatever they chose. Anything at or above what the party owes is
   * acceptable — `confirm_booking` credits an overpayment to the wallet
   * through the existing ledger path. Anything below it is an underpayment,
   * and an underpaid party must never be seated: that is a pitch short of
   * money on the day, discovered by the organizer.
   */
  if v_reason is null
     and p_amount_czk < (v_booking.price_czk - v_booking.credit_applied_czk) then
    v_reason := 'paid ' || p_amount_czk::text || ' CZK against '
             || (v_booking.price_czk - v_booking.credit_applied_czk)::text || ' CZK owed';
  end if;

  -- A booking the player cancelled, or one that expired, cannot be seated by
  -- a late payment. `confirm_booking` already credits a post-expiry payment to
  -- the wallet and refuses to reinstate the spot; anything else is a human's.
  if v_reason is null and v_booking.status not in ('reserved', 'expired') then
    v_reason := 'booking status is ' || v_booking.status::text;
  end if;

  /*
   * THE SEAT MAY HAVE GONE. This is the edge the owner named: the window
   * closed, the game filled with other people, and then the money arrived.
   *
   * Counted EXCLUDING this booking, because a stale pending is already
   * excluded from `game_seats_taken` and a fresh one is already inside it —
   * so the honest question is "does the rest of the game leave room".
   */
  if v_reason is null and v_booking.status = 'reserved' then
    select coalesce(sum(1 + b.guest_count)::integer, 0) into v_taken
      from public.bookings b
     where b.game_id = v_booking.game_id
       and b.id <> v_booking.id
       and public.booking_holds_seat(b.status, b.payment_pending_at);

    v_taken := v_taken + coalesce(v_game.guest_count, 0);

    if v_taken + v_seats > v_game.capacity then
      v_reason := 'paid after the window closed and the game filled: '
               || v_taken::text || ' of ' || v_game.capacity::text || ' seats taken';
    end if;
  end if;

  -- --- needs attention ------------------------------------------------------
  if v_reason is not null then
    update public.bookings
       set payment_attention_at     = now(),
           payment_attention_reason = v_reason,
           stripe_session_id        = coalesce(stripe_session_id, p_session_id)
     where id = p_booking_id;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('payment_unmatched', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'session_id', p_session_id,
              'amount_czk', p_amount_czk,
              'reason', v_reason),
            v_game.city, v_game.brand);

    return 'attention';
  end if;

  -- --- seated ---------------------------------------------------------------
  -- The clock is cleared BEFORE confirming, so that `booking_holds_seat` is
  -- already true when `confirm_booking` runs and cannot see a seat it is about
  -- to fill as expired.
  update public.bookings
     set payment_pending_at = null,
         stripe_session_id  = p_session_id
   where id = p_booking_id;

  -- The existing ledger path, unchanged: it emits `payment_confirmed`, credits
  -- an overpayment, and credits a post-expiry payment without reinstating the
  -- spot.
  perform public.confirm_booking(p_booking_id, null, p_amount_czk);

  perform public.sync_game_fullness(v_booking.game_id);

  return 'confirmed';
end;
$$;

revoke execute on function public.confirm_online_payment(uuid, text, integer) from public;
grant execute on function public.confirm_online_payment(uuid, text, integer) to service_role;

comment on function public.confirm_online_payment(uuid, text, integer) is
  'The Stripe webhook''s only write. Idempotent by stripe_session_id; refuses '
  'to seat an underpayment or a seat that no longer exists, flagging both for '
  'manual resolution instead.';

-- -----------------------------------------------------------------------------
-- 7. retry_online_payment — the player pressing "try again"
--
-- Restarts the window if the seats are still there, and says so if they are
-- not. Without this a player whose window closed would be handed back to
-- Stripe holding nothing, and would pay for a seat the webhook then could not
-- give them — manufacturing the very needs-attention case section 6 exists to
-- handle.
-- -----------------------------------------------------------------------------

create function public.retry_online_payment(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_taken   integer;
  v_seats   integer;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- The owner, and only the owner.
  if v_booking.player_id is distinct from public.current_player_id() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'retry_online_payment retries only the calling player''s own booking';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  if v_booking.status <> 'reserved' or v_booking.payment_pending_at is null then
    raise exception 'INVALID_TRANSITION'
      using detail = 'this booking is not awaiting an online payment';
  end if;

  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'GAME_NOT_BOOKABLE';
  end if;

  v_seats := 1 + v_booking.guest_count;

  select coalesce(sum(1 + b.guest_count)::integer, 0) into v_taken
    from public.bookings b
   where b.game_id = v_booking.game_id
     and b.id <> v_booking.id
     and public.booking_holds_seat(b.status, b.payment_pending_at);

  v_taken := v_taken + coalesce(v_game.guest_count, 0);

  if v_taken + v_seats > v_game.capacity then
    return false;
  end if;

  update public.bookings set payment_pending_at = now() where id = p_booking_id;
  perform public.sync_game_fullness(v_booking.game_id);

  return true;
end;
$$;

revoke execute on function public.retry_online_payment(uuid) from public;
grant execute on function public.retry_online_payment(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Verification, against the live catalog
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'bookings_stripe_session_id_key'
  ) then
    raise exception 'online payments: the idempotency index is missing';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_booking' and p.pronargs = 5
  ) then
    raise exception 'online payments: the five-argument create_booking still exists';
  end if;

  if not (
    select count(*) = 7 from information_schema.columns
     where table_schema = 'public' and table_name = 'game_roster_public'
  ) then
    raise exception 'online payments: the roster view changed shape';
  end if;

  if not (has_table_privilege('anon', 'public.game_roster_public', 'SELECT')
          and has_table_privilege('authenticated', 'public.game_roster_public', 'SELECT')) then
    raise exception 'online payments: the roster view lost its read grant';
  end if;

  -- The webhook's write must NOT be reachable by a signed-in player.
  if has_function_privilege('authenticated',
       'public.confirm_online_payment(uuid, text, integer)', 'EXECUTE') then
    raise exception 'online payments: confirm_online_payment is callable by authenticated';
  end if;
end $$;
