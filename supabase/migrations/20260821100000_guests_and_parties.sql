-- =============================================================================
-- Round 11 — GUESTS: house guests on a game, party guests on a booking
--
-- ONE CONCEPT, TWO PLACES IT CAN LIVE, AND THE SPLIT IS NOT ARBITRARY.
--
--   A HOUSE GUEST belongs to the GAME. An admin holds N anonymous seats
--     ("Guest 1", "Guest 2") for people who are coming but have no account and
--     never will. They are interchangeable: removing "Guest 2" of three is a
--     decrement, because there is nothing about Guest 2 that differs from
--     Guest 3. `games.guest_count`.
--
--   A PARTY GUEST belongs to a BOOKING. A player brings friends; the seats are
--     theirs, they are paid for together, and cancelling releases all of them
--     at once. `bookings.guest_count`.
--
-- WHY NOT PLAYER ROWS FOR EITHER. Both were shadow players until this
-- migration — a `players` row with a null `auth_user_id` plus its own booking.
-- Three things made that wrong:
--
--   1. `players_nickname_key` is a unique index on `lower(nickname)`. "Guest 1"
--      can exist ONCE in the entire database, so auto-naming was impossible
--      without a global counter and a display name that disagreed with the
--      stored one.
--   2. A party of four was four independent bookings. "Cancelling releases all
--      its spots" then means a loop that can half-fail, and the refund is four
--      refunds that have to agree.
--   3. Every guest was a permanent identity in a table that answers "who plays
--      here". A guest is a seat, not a person.
--
-- EXISTING SHADOW PLAYERS ARE UNTOUCHED AND KEEP THEIR ROWS. Nothing is
-- deleted, nothing is migrated. They render AS guests from now on, which needs
-- no column: a shadow is exactly `auth_user_id is null`, and the roster view
-- below projects that as `is_guest`. A shadow who later signs in and is claimed
-- gains an `auth_user_id` and stops being a guest, which is correct.
--
-- SEATS ARE COUNTED IN ONE PLACE. `game_seats_taken()` is the only definition
-- of how full a game is, and the three call sites that used to count bookings
-- now call it. A capacity rule that is written out three times is a capacity
-- rule that will disagree with itself.
--
-- Rollback: supabase/rollback/20260821100000_guests_and_parties_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------

alter table public.games
  add column guest_count integer not null default 0;

alter table public.games
  add constraint games_guest_count_non_negative check (guest_count >= 0);

alter table public.bookings
  add column guest_count integer not null default 0;

-- The UPPER BOUND IS NOT HERE. `+1/+2/+3` is a policy window, and policy
-- windows are values the RPC enforces (mirrored in `lib/policy.ts`) rather
-- than constants frozen into a CHECK that a v2 has to migrate away. What the
-- column guarantees is only that a seat count is not negative.
alter table public.bookings
  add constraint bookings_guest_count_non_negative check (guest_count >= 0);

comment on column public.games.guest_count is
  'House guests: anonymous seats an admin holds on this game. They consume '
  'capacity and render as "Guest N". Interchangeable — removal is a decrement.';

comment on column public.bookings.guest_count is
  'Party guests riding on this booking. Total seats are 1 + guest_count, '
  'price_czk is the whole party''s, and cancelling releases all of them.';

-- -----------------------------------------------------------------------------
-- 2. The single definition of how full a game is
-- -----------------------------------------------------------------------------

create function public.game_seats_taken(p_game_id uuid)
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
         and b.status in ('reserved', 'confirmed')
    ), 0);
$$;

comment on function public.game_seats_taken(uuid) is
  'Seats consumed on a game: house guests, plus one per active booking, plus '
  'that booking''s party guests. The ONLY definition — sync_game_fullness, '
  'create_booking_internal and set_game_capacity all call it.';

revoke execute on function public.game_seats_taken(uuid) from public;
grant execute on function public.game_seats_taken(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. The event catalog, widened in the same migration that emits the type
--
-- Postgres cannot extend a CHECK in place: drop and re-add, restating the list
-- in full. Pre-approved (CLAUDE.md, 2026-08-01) while the new list is a strict
-- superset — it is: one addition, `game_guests_changed`.
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
    'game_guests_changed',
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

-- -----------------------------------------------------------------------------
-- 4. sync_game_fullness — same rule, counted through the helper
-- -----------------------------------------------------------------------------

create or replace function public.sync_game_fullness(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_status   public.game_status;
  v_taken    integer;
begin
  select g.capacity, g.status into v_capacity, v_status
    from public.games g where g.id = p_game_id;

  if v_status is null or v_status not in ('published', 'full') then
    return;
  end if;

  v_taken := public.game_seats_taken(p_game_id);

  if v_taken >= v_capacity and v_status = 'published' then
    update public.games set status = 'full' where id = p_game_id;
  elsif v_taken < v_capacity and v_status = 'full' then
    update public.games set status = 'published' where id = p_game_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. set_game_capacity — a game may not be shrunk below the seats it owes
-- -----------------------------------------------------------------------------

create or replace function public.set_game_capacity(p_game_id uuid, p_capacity integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_taken integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  if p_capacity is null or p_capacity < 1 then
    raise exception 'INVALID_CAPACITY';
  end if;

  -- SEATS, NOT BOOKINGS. A game with four bookings that between them hold
  -- seven seats cannot be cut to five: the guests are as booked as the
  -- players carrying them, and there is no sanctioned way to un-seat one as a
  -- side effect of an edit.
  v_taken := public.game_seats_taken(p_game_id);

  if p_capacity < v_taken then
    raise exception 'CAPACITY_BELOW_ACTIVE_BOOKINGS'
      using detail = 'seats taken: ' || v_taken::text;
  end if;

  update public.games set capacity = p_capacity where id = p_game_id;
  perform public.sync_game_fullness(p_game_id);

  return p_capacity;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. set_game_guests — the admin's house guests
-- -----------------------------------------------------------------------------

create function public.set_game_guests(p_game_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game    public.games%rowtype;
  v_others  integer;
  v_before  integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'set_game_guests requires an admin session or service role';
  end if;

  if p_count is null or p_count < 0 then
    raise exception 'INVALID_GUEST_COUNT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- A terminal game's roster is history. Adding a guest to a settled game
  -- would change a count that has already been reported and paid against.
  if v_game.status not in ('draft', 'published', 'full') then
    raise exception 'GAME_NOT_BOOKABLE'
      using detail = 'game status is ' || v_game.status::text;
  end if;

  v_before := v_game.guest_count;

  -- Everything except the house guests, so raising the house count is checked
  -- against the room that is actually left.
  v_others := public.game_seats_taken(p_game_id) - v_before;

  if v_others + p_count > v_game.capacity then
    raise exception 'CAPACITY_FULL'
      using detail = 'seats taken by players: ' || v_others::text
                  || ', capacity: ' || v_game.capacity::text;
  end if;

  update public.games set guest_count = p_count where id = p_game_id;

  -- Same transaction as the state change, always.
  insert into public.events (event_type, player_id, game_id, metadata, city, brand)
  values ('game_guests_changed', public.current_player_id(), p_game_id,
          jsonb_build_object(
            'from', v_before,
            'to', p_count,
            'acting_admin_player_id', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(p_game_id);

  return p_count;
end;
$$;

revoke execute on function public.set_game_guests(uuid, integer) from public;
grant execute on function public.set_game_guests(uuid, integer) to authenticated, service_role;

comment on function public.set_game_guests(uuid, integer) is
  'Sets the number of anonymous house guests on a game. Admin or service role '
  'only; capacity-checked against every other seat; syncs fullness.';

-- -----------------------------------------------------------------------------
-- 7. create_booking_internal — a booking may now carry a party
--
-- The signature gains a parameter, so this is a DROP and a re-create rather
-- than a `create or replace`: a different argument list is a different
-- function, and replacing without dropping would leave two overloads with the
-- old one still reachable. `admin_create_booking` calls it with five positional
-- arguments and keeps working through the default.
-- -----------------------------------------------------------------------------

drop function if exists public.create_booking(uuid, public.payment_method, uuid, uuid);
drop function if exists public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean);

create function public.create_booking_internal(
  p_game_id          uuid,
  p_player_id        uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid,
  p_booked_by_admin  boolean,
  p_guest_count      integer default 0
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- THE PARTY CEILING, RESTATED FROM `lib/policy.ts`.
  --
  -- SQL cannot read a TypeScript module, so this is the second policy window
  -- that exists in two places — `cancel_booking`'s cutoff is the first, and
  -- the same rule applies: `policy.booking.maxPartyGuests` is display only and
  -- THIS is the authority, because a route guard is skipped by anyone using
  -- curl. If the two disagree, the database is right and the UI is lying.
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

  -- Capacity, counted under the game lock — and counted in SEATS, so a party
  -- of three cannot squeeze into one remaining spot. The whole party fits or
  -- none of it does; there is no partial booking, because a player who asked
  -- for three seats and got one has been given something they did not choose.
  v_taken := public.game_seats_taken(p_game_id);

  if v_taken + v_seats > v_game.capacity then
    raise exception 'CAPACITY_FULL'
      using detail = 'seats taken ' || v_taken::text
                  || ', requested ' || v_seats::text
                  || ', capacity ' || v_game.capacity::text;
  end if;

  -- THE PARTY'S PRICE IS THE BOOKING'S PRICE, and that is what makes every
  -- downstream reader work untouched: the variable symbol is for this amount,
  -- `credit_applied_czk` is capped by it, the confirmation email quotes it,
  -- and `cancel_booking` refunds it. One booking owes one number.
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

  insert into public.bookings (
    game_id, player_id, status, payment_method, payment_code,
    price_czk, credit_applied_czk, is_seed, booked_by_admin, guest_count
  ) values (
    p_game_id, p_player_id, v_status, v_method, v_payment_code,
    v_price, v_credit_applied, v_player.is_seed, p_booked_by_admin, p_guest_count
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
  public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean, integer)
  from public;

-- -----------------------------------------------------------------------------
-- 8. create_booking — the owner-only entry point, now carrying the party size
-- -----------------------------------------------------------------------------

create function public.create_booking(
  p_game_id          uuid,
  p_payment_method   public.payment_method,
  p_from_waitlist_id uuid default null,
  p_player_id        uuid default null,
  p_guest_count      integer default 0
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
    p_game_id, v_player_id, p_payment_method, p_from_waitlist_id, false, p_guest_count);
end;
$$;

revoke execute on function
  public.create_booking(uuid, public.payment_method, uuid, uuid, integer) from public;
grant execute on function
  public.create_booking(uuid, public.payment_method, uuid, uuid, integer)
  to authenticated, service_role;

comment on function public.create_booking(uuid, public.payment_method, uuid, uuid, integer) is
  'Owner-only booking entry point. Identity comes from auth.uid(); p_player_id '
  'is accepted only to be rejected when it names anyone else. Accepts qr|cash '
  'and derives credit|seed_free. p_guest_count books a party of 1+n seats on '
  'one booking, priced and refunded as one.';

-- -----------------------------------------------------------------------------
-- 9. game_roster_public — ONE ROW PER SEAT
--
-- This is the change that makes everything above visible, and it is deliberately
-- the smallest one that could: the view already WAS the roster and already WAS
-- the thing the games list counts players from, so emitting a row per seat
-- makes both the count and the avatars correct without a single caller
-- learning what a guest is.
--
-- THREE SOURCES, ONE SHAPE:
--
--   1. The booking holder's own seat. `is_guest` is true for a legacy shadow
--      player — `auth_user_id is null` — which is how every pre-round-11 guest
--      keeps rendering, under its own name, with no backfill.
--   2. One row per party guest on that booking. `nickname` is NULL and the
--      owner's name arrives as `guest_of`, so a party guest can never match
--      the viewer's own nickname and steal the "this is you" ring.
--   3. One row per house guest on the game. No name at all: the caller renders
--      "Guest N" from `guest_index`.
--
-- THE LABEL IS NOT IN THE VIEW. "Karel's Guest 2" is copy, and copy lives in
-- `lib/strings.ts` in three languages. A view that returned an English string
-- would be a translation the Czech UI could not reach.
--
-- PII: unchanged. `guest_of` is a nickname that the holder's own row already
-- publishes for the same game; no player_id, email, phone or booking status.
-- The game-status filter stays in the view body and is still the sole
-- enforcement point.
-- -----------------------------------------------------------------------------

drop view public.game_roster_public;

create view public.game_roster_public as
  -- 1. the seat belonging to the person who booked
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
    and b.status in ('reserved', 'confirmed')

  union all

  -- 2. the party riding on that booking
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
    and b.status in ('reserved', 'confirmed')
    and b.guest_count > 0

  union all

  -- 3. the house guests an admin is holding
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
-- site would show zero players and it would read as "nobody has booked
-- anything" rather than as a permissions fault.
grant select on public.game_roster_public to anon, authenticated;

comment on view public.game_roster_public is
  'Anonymous roster surface, ONE ROW PER SEAT. Projects game_id, nickname, '
  'photo_path, games_played, is_guest, guest_of and guest_index — never '
  'player_id, email, phone or booking status. SECURITY DEFINER by design; the '
  'game-status filter in the view body is the sole enforcement point and must '
  'not be removed.';

-- -----------------------------------------------------------------------------
-- 10. Verification, in the migration, against the live catalog
--
-- Every claim above that a later reader would otherwise have to take on trust.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name  = 'game_roster_public'
       and column_name in ('status', 'player_id', 'email', 'phone')
  ) then
    raise exception 'guests: the roster view leaks a column it must not project';
  end if;

  if not (
    select count(*) = 7 from information_schema.columns
     where table_schema = 'public'
       and table_name  = 'game_roster_public'
       and column_name in ('game_id', 'nickname', 'photo_path', 'games_played',
                           'is_guest', 'guest_of', 'guest_index')
  ) then
    raise exception 'guests: the roster view is missing a column it must project';
  end if;

  if not (has_table_privilege('anon', 'public.game_roster_public', 'SELECT')
          and has_table_privilege('authenticated', 'public.game_roster_public', 'SELECT')) then
    raise exception 'guests: the roster view lost its read grant';
  end if;

  -- The old four-argument create_booking must be GONE, not shadowed. Two
  -- overloads would let a stale caller book with no party and no error, which
  -- is the failure that looks like success.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'create_booking'
       and p.pronargs = 4
  ) then
    raise exception 'guests: the four-argument create_booking still exists';
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_game_guests'
  ) then
    raise exception 'guests: set_game_guests was not created';
  end if;
end $$;
