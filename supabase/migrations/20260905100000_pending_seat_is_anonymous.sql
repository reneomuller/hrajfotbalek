-- =============================================================================
-- Round 25 item 1 — an unpaid seat is never a named participant
--
-- WHAT WAS REPRODUCED, ON PRODUCTION DATA, BEFORE ANY OF THIS WAS WRITTEN.
--
-- A player picks "Online payment", is sent to Stripe, and closes the tab. The
-- booking is `reserved` with `payment_pending_at` set, and
-- `booking_holds_seat()` — correctly — keeps its seat for thirty minutes so a
-- race cannot sell the same spot twice while they are typing a card number.
--
-- `game_roster_public` used the SAME predicate to decide whose NAME to
-- publish. So for thirty minutes the abandoner's nickname and photograph sat
-- on the public roster, indistinguishable from somebody who had paid.
--
-- THAT IS TWO DIFFERENT DECISIONS SHARING ONE PREDICATE, and only one of them
-- was right. Holding the seat is the design and it stays. Publishing the
-- person as a participant was never intended and is what this migration ends.
--
-- IT IS NOT THE R41 RESIDUAL. R41's open risk is that the BOOKING half of the
-- Stripe rail might diverge from the proven PASS half after payment. This is
-- entirely before payment, in code both halves share, and the pass half has
-- the same lingering row with none of the exposure — a `credit_topups` row is
-- published nowhere.
--
-- THE SECOND HALF, WHICH NOBODY HAD LOOKED FOR. The seat frees on the clock
-- because the predicate is time-based, but the ROW never moves: nothing
-- transitions a stale `payment_pending_at` booking to `expired`. The expiry
-- sweep works on `expires_at`, which is null for an online booking — it is set
-- by the nudge, and a booking abandoned in its first thirty minutes is never
-- nudged.
--
-- Production on 2026-09-05: one such row, from 2026-08-23, thirteen days
-- `reserved` on a game that has since been played — and `settle_game` refuses
-- while any `reserved` booking remains, so that game can never be settled.
-- **Eight games are currently blocked from settling by a lingering reserved
-- booking.** Most are legacy cash holds; this one is provably an abandoned
-- checkout, and every future abandonment would add another.
--
-- Rollback: supabase/rollback/20260905100000_pending_seat_is_anonymous_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The predicate that was missing
--
-- `booking_holds_seat` answers "does this seat count". This answers "may we
-- publish who is in it", and the two are not the same question — which is the
-- whole defect, stated as a function so it cannot be conflated again.
-- -----------------------------------------------------------------------------
create or replace function public.booking_is_named(
  p_status     public.booking_status,
  p_pending_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  /*
   * A CONFIRMED booking is named: somebody paid, or a wallet covered it, or an
   * admin settled it on the pitch.
   *
   * A `reserved` booking with NO `payment_pending_at` is also named, and that
   * is deliberate rather than an oversight: those are the legacy cash holds an
   * organizer arranged personally, plus admin-created bookings. The organizer
   * knows who is coming and the roster is how everybody else finds out. Cash
   * left the booking flow in round 23, so this set only shrinks.
   *
   * A `reserved` booking WITH `payment_pending_at` is somebody who is at a
   * payment page right now, or who closed the tab. They are not a participant
   * until the webhook says so.
   */
  select p_status = 'confirmed'
      or (p_status = 'reserved' and p_pending_at is null);
$$;

comment on function public.booking_is_named(public.booking_status, timestamptz) is
  'May this booking be published with a name on the roster? NOT the same '
  'question as booking_holds_seat(), which answers whether the seat counts — '
  'an unpaid checkout holds a seat and names nobody.';

-- -----------------------------------------------------------------------------
-- 2. The roster
--
-- FOUR BRANCHES NOW. The first three are unchanged apart from their filter;
-- the fourth is new and is the whole point: a pending checkout still occupies
-- a row, so the list length and the capacity bar stay honest, and the row says
-- what it is instead of who it is.
--
-- `is_pending` IS A COLUMN RATHER THAN A CONVENTION. The alternative — reuse
-- `is_guest` with a null index and let the UI infer — hides a rule in two
-- files and mislabels a real player as somebody's guest.
-- -----------------------------------------------------------------------------
drop view if exists public.game_roster_public;

create view public.game_roster_public
with (security_invoker = false)
as
  -- Named players.
  select b.game_id,
         p.nickname,
         p.photo_path,
         (select count(*)
            from public.bookings b2
            join public.games g2 on g2.id = b2.game_id
           where b2.player_id = p.id
             and b2.status in ('reserved', 'confirmed')
             and g2.status in ('played', 'settled'))::integer as games_played,
         p.auth_user_id is null as is_guest,
         null::text            as guest_of,
         null::integer         as guest_index,
         false                 as is_pending
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
     and public.booking_is_named(b.status, b.payment_pending_at)

  union all

  -- Party guests, one row per seat. A guest of a pending booking is unnamed
  -- either way, so the owner's name is dropped while the payment is open.
  select b.game_id,
         null::text as nickname,
         null::text as photo_path,
         0          as games_played,
         true       as is_guest,
         case
           when public.booking_is_named(b.status, b.payment_pending_at) then p.nickname
           else null
         end        as guest_of,
         seat.seat  as guest_index,
         not public.booking_is_named(b.status, b.payment_pending_at) as is_pending
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
    cross join lateral generate_series(1, b.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
     and b.guest_count > 0

  union all

  -- House guests: seats an admin holds, belonging to nobody.
  select g.id      as game_id,
         null::text as nickname,
         null::text as photo_path,
         0          as games_played,
         true       as is_guest,
         null::text as guest_of,
         seat.seat  as guest_index,
         false      as is_pending
    from public.games g
    cross join lateral generate_series(1, g.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and g.guest_count > 0

  union all

  -- THE NEW ONE: a seat held by a checkout in progress. No nickname, no photo,
  -- no games-played figure — nothing that identifies anybody.
  select b.game_id,
         null::text    as nickname,
         null::text    as photo_path,
         0             as games_played,
         false         as is_guest,
         null::text    as guest_of,
         null::integer as guest_index,
         true          as is_pending
    from public.bookings b
    join public.games g on g.id = b.game_id
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
     and not public.booking_is_named(b.status, b.payment_pending_at);

grant select on public.game_roster_public to anon, authenticated, service_role;

comment on view public.game_roster_public is
  'The public roster. A booking in checkout occupies a row and publishes no '
  'identity: `is_pending` is true, every naming column is null. The seat still '
  'counts, so capacity stays honest.';

-- -----------------------------------------------------------------------------
-- 3. The sweep that was missing
--
-- The seat frees itself on the clock; the ROW never moved. This transitions it
-- through `expire_booking`, which is the one definition of that transition and
-- already emits `booking_expired` + `spot_released` in a single transaction.
-- -----------------------------------------------------------------------------
create or replace function public.expire_pending_online_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_expired integer := 0;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'expire_pending_online_payments requires an admin session or service role';
  end if;

  for v_booking in
    select b.id
      from public.bookings b
     where b.status = 'reserved'
       and b.payment_pending_at is not null
       and b.payment_pending_at < now() - public.online_payment_window()
     order by b.payment_pending_at
       for update skip locked
  loop
    begin
      perform public.expire_booking(v_booking.id);
      v_expired := v_expired + 1;
    exception
      when others then
        -- A booking that raced to another status is not an error worth failing
        -- the sweep over, which is the rule every other sweep here follows.
        null;
    end;
  end loop;

  return v_expired;
end;
$$;

revoke execute on function public.expire_pending_online_payments() from public;
grant execute on function public.expire_pending_online_payments() to service_role, authenticated;

comment on function public.expire_pending_online_payments() is
  'Transitions abandoned checkouts from reserved to expired once their thirty '
  'minutes are up. The SEAT was already free — booking_holds_seat is '
  'time-based — but the row lingered forever and blocked settle_game.';

-- -----------------------------------------------------------------------------
-- 4. The capability flag
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true,
    'organizerTelegram',    true,
    'playersMet',           true,
    'playedSweep',          true,
    'playerNotifications',  true,
    'pendingSeatAnonymous', true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps    jsonb;
  v_player  uuid;
  v_venue   uuid;
  v_game    uuid;
  v_booking uuid;
  v_named   integer;
  v_pending integer;
  v_seats   integer;
  v_expired integer;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'pendingSeatAnonymous')::boolean, false) is not true then
    raise exception 'pending seat: the capability flag did not turn on';
  end if;
  if coalesce((v_caps ->> 'playersMet')::boolean, false) is not true
     or coalesce((v_caps ->> 'playedSweep')::boolean, false) is not true
     or coalesce((v_caps ->> 'playerNotifications')::boolean, false) is not true then
    raise exception 'pending seat: restating app_capabilities switched an older flag off';
  end if;

  select id into v_player from public.players
   where auth_user_id is not null order by created_at limit 1;
  if v_player is null then
    raise notice 'pending seat: no signed-up player here — shape checked, roster NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    insert into public.venues (name) values ('pending seat probe') returning id into v_venue;
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status)
         values ('pending seat probe', v_venue, now() + interval '2 days', 12, 150, 'published')
      returning id into v_game;

    -- A checkout in progress: reserved, pending, inside the window.
    insert into public.bookings
           (game_id, player_id, status, price_czk, payment_method, payment_pending_at)
         values (v_game, v_player, 'reserved', 150, 'qr', now())
      returning id into v_booking;

    select count(*) into v_named
      from public.game_roster_public where game_id = v_game and nickname is not null;
    select count(*) into v_pending
      from public.game_roster_public where game_id = v_game and is_pending;
    select public.game_seats_taken(v_game) into v_seats;

    if v_named <> 0 then
      raise exception 'pending seat: % named rows on a roster with only a checkout in progress', v_named;
    end if;
    if v_pending <> 1 then
      raise exception 'pending seat: expected 1 held seat, got %', v_pending;
    end if;
    if v_seats <> 1 then
      raise exception 'pending seat: the seat stopped counting (% taken)', v_seats;
    end if;

    -- PAST THE WINDOW: the seat frees itself, and the sweep moves the row.
    update public.bookings
       set payment_pending_at = now() - interval '45 minutes'
     where id = v_booking;

    select public.game_seats_taken(v_game) into v_seats;
    if v_seats <> 0 then
      raise exception 'pending seat: an abandoned checkout still holds a seat (% taken)', v_seats;
    end if;
    if exists (select 1 from public.game_roster_public where game_id = v_game) then
      raise exception 'pending seat: an abandoned checkout still has a roster row';
    end if;

    select public.expire_pending_online_payments() into v_expired;
    if v_expired < 1 then
      raise exception 'pending seat: the sweep expired % bookings, expected at least 1', v_expired;
    end if;
    if (select status from public.bookings where id = v_booking) <> 'expired' then
      raise exception 'pending seat: the abandoned booking is still reserved after the sweep';
    end if;

    raise exception 'pending_seat_probe_rollback';
  exception
    when others then
      if sqlerrm <> 'pending_seat_probe_rollback' then
        raise;
      end if;
      raise notice 'pending seat: exercised and undone — nobody named, seat counted, freed on the clock, row expired by the sweep';
  end;
end $$;
