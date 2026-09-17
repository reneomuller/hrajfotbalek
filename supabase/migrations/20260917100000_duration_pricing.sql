-- =============================================================================
-- ROUND 35 v5, ITEMS 1 AND 2 — the price comes from the duration, and a credit
-- is a 90-minute seat.
--
-- ~~EVERY GAME COSTS 180.~~ That was round 35 v2's flat reprice and it lasted
-- two days. The owner's refinement: **60 minutes is 150 CZK, 90 minutes is
-- 180**, and a CREDIT buys one 90-minute seat. Sixty-minute games are
-- online-only — no credit option anywhere — because a credit is not a unit of
-- money that can be part-spent on a shorter game, it is one game of a
-- particular length.
--
-- ONE MAPPING, AND IT IS `public.price_for_duration()`. Not a literal in the
-- create RPC, not a default in the admin form, not a number in the seed. The
-- crop-constant lesson applied to money: round 35 v2's audit found the price in
-- four places and one of them was a CHECK constraint, and the only reason that
-- was findable is that somebody went looking. A mapping that exists once cannot
-- be found in four places.
--
-- THE CREDIT NOMINAL STAYS 180 and is a DIFFERENT NUMBER that happens to match
-- the 90-minute price. `credit_seat_price_czk()` is what a credit is worth in
-- the ledger; `price_for_duration(90)` is what a 90-minute game costs a card.
-- They agree today and the product must not assume they always will — which is
-- why this file keeps them as two functions rather than one.
--
-- 120-MINUTE GAMES ARE PRICED AT 180 AND FLAGGED, NOT INVENTED. Production has
-- exactly one — settled, 2026-08-27, Praha 5 • Smíchov — so the choice costs
-- nothing today and is the owner's to rule on. The mapping returns the
-- 90-minute price for anything that is not 60, which is a decision this comment
-- exists to make visible rather than a gap.
--
-- SHAPE AND BACKFILL AT THE FOOT. A migration's verification block may not
-- write a row, but it may assert the result of a backfill it performed — and
-- this file is mostly backfill.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The mapping
-- -----------------------------------------------------------------------------

create or replace function public.price_for_duration(p_minutes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  /*
   * NULL IS SIXTY. `games.duration_minutes` is nullable and a null row renders
   * as the standard length — `policy.game.durationMinutes` — so a null game is
   * a 60-minute game and is priced like one. Reading null as "unknown, charge
   * the higher price" would bill nineteen historical games for time nobody
   * booked.
   */
  select case coalesce(p_minutes, 60) when 60 then 150 else 180 end
$$;

revoke execute on function public.price_for_duration(integer) from public;
grant execute on function public.price_for_duration(integer)
  to anon, authenticated, service_role;

comment on function public.price_for_duration(integer) is
  'What a game of this length costs a card. 60 -> 150, everything else -> 180. '
  'THE single mapping; lib/games/price.ts mirrors it for display.';

-- -----------------------------------------------------------------------------
-- 2. How long a credit buys
--
-- A SECOND FUNCTION, NOT A SECOND USE OF THE FIRST. `credit_seat_price_czk()`
-- is the ledger nominal (180) and this is the length a credit is good for (90).
-- They are different facts and the product must be able to move one without
-- the other.
-- -----------------------------------------------------------------------------

create or replace function public.credit_seat_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$ select 90 $$;

revoke execute on function public.credit_seat_minutes() from public;
grant execute on function public.credit_seat_minutes()
  to anon, authenticated, service_role;

comment on function public.credit_seat_minutes() is
  'One credit buys one seat at a game of this length. Games of any other '
  'length are online-only.';

-- -----------------------------------------------------------------------------
-- 3. EVERY GAME REPRICES PER ITS DURATION, published included
-- -----------------------------------------------------------------------------

update public.games
   set price_czk = public.price_for_duration(duration_minutes)
 where price_czk is distinct from public.price_for_duration(duration_minutes);

-- -----------------------------------------------------------------------------
-- 4. THE WRITERS DERIVE THE PRICE, so no caller can create a disagreement
--
-- `p_price_czk` stays on both signatures and is now IGNORED, which is
-- deliberate: dropping a parameter changes the signature, and every caller —
-- the admin form, the seed, the e2e scaffolding — would have to move in the
-- same commit for no gain. The validation stays too, so a caller sending
-- nonsense still hears about it rather than having it silently discarded.
--
-- `admin_update_game` DOES NOT TAKE A DURATION, so it prices from the row's
-- existing one. Editing a game cannot change its length today; if that ever
-- changes, this is the line that has to move with it.
--
-- Rewritten in place — reading what is installed, substituting, raising if the
-- text is not what is expected — rather than restating two long bodies here.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text :=
    '    v_venue.name, v_venue.id, p_starts_at, p_capacity, p_price_czk,';
  v_new constant text :=
    '    -- ROUND 35 v5: the price comes from the length, never from the caller.'
    || chr(10) ||
    '    v_venue.name, v_venue.id, p_starts_at, p_capacity,'
    || chr(10) ||
    '    public.price_for_duration(p_duration_minutes),';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_create_game_v2';

  if v_def is null then
    raise exception 'duration pricing: admin_create_game_v2 is missing';
  elsif position('price_for_duration' in v_def) > 0 then
    raise notice 'duration pricing: admin_create_game_v2 already derives the price';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'duration pricing: admin_create_game_v2 does not carry the expected insert';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

do $$
declare
  v_def text;
  v_old constant text := '         price_czk  = p_price_czk,';
  v_new constant text :=
    '         -- ROUND 35 v5: from the row''s own length, never from the caller.'
    || chr(10) ||
    '         price_czk  = public.price_for_duration(v_game.duration_minutes),';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_update_game';

  if v_def is null then
    raise exception 'duration pricing: admin_update_game is missing';
  elsif position('price_for_duration' in v_def) > 0 then
    raise notice 'duration pricing: admin_update_game already derives the price';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'duration pricing: admin_update_game does not carry the expected update';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. ITEM 1 — CREDIT ONLY ON A 90-MINUTE GAME
--
-- `create_booking_internal` already applies credit by whole seats (round 35).
-- The change is one more condition on the same statement: a game of any other
-- length applies nothing, so the booking comes back owing its full price and
-- the only rail left is the online one. **The seats and the capacity checks are
-- untouched** — this is about who pays how, never about who gets in.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := '    v_credit_applied := case when v_game.price_czk > 0 then';
  v_new constant text :=
    '    -- ROUND 35 v5: A CREDIT IS A 90-MINUTE SEAT. A game of any other'
    || chr(10) ||
    '    -- length takes no credit at all — it is online-only, and the booking'
    || chr(10) ||
    '    -- below comes back owing its whole price.'
    || chr(10) ||
    '    v_credit_applied := case when v_game.price_czk > 0'
    || chr(10) ||
    '      and coalesce(v_game.duration_minutes, 60) = public.credit_seat_minutes() then';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking_internal';

  if v_def is null then
    raise exception 'credit minutes: create_booking_internal is missing';
  elsif position('credit_seat_minutes' in v_def) > 0 then
    raise notice 'credit minutes: create_booking_internal already checks the length';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'credit minutes: create_booking_internal does not carry the expected credit block';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. And the add-guests credit rail refuses outright
--
-- A NAMED ERROR RATHER THAN A SILENT ZERO. The booking path can apply no credit
-- and carry on, because there is another rail behind it in the same form. This
-- one IS the rail: the player pressed the credit button, and the honest answer
-- is that this game does not take credit.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := '  v_cost := public.credit_seat_price_czk() * p_guest_count;';
  v_new constant text :=
    '  -- ROUND 35 v5: a credit is a 90-minute seat; anything else is online-only.'
    || chr(10) ||
    '  if coalesce(v_game.duration_minutes, 60) <> public.credit_seat_minutes() then'
    || chr(10) ||
    '    raise exception ''GAME_NOT_CREDIT_ELIGIBLE'''
    || chr(10) ||
    '      using detail = ''a credit buys a '' || public.credit_seat_minutes()::text'
    || chr(10) ||
    '                  || ''-minute seat'';'
    || chr(10) ||
    '  end if;'
    || chr(10) ||
    chr(10) ||
    '  v_cost := public.credit_seat_price_czk() * p_guest_count;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'add_guests_with_credit';

  if v_def is null then
    raise exception 'credit minutes: add_guests_with_credit is missing';
  elsif position('GAME_NOT_CREDIT_ELIGIBLE' in v_def) > 0 then
    raise notice 'credit minutes: add_guests_with_credit already refuses a short game';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'credit minutes: add_guests_with_credit does not carry the expected cost line';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. The capability flag
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

    -- Probed, never asserted: an out-of-order or partial apply cannot make one
    -- of these lie. Round 33's trap, closed in round 34.
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

    -- Created by THIS file.
    'durationPricing',   true
  )
$$;

-- -----------------------------------------------------------------------------
-- 8. VERIFICATION — SHAPE, PLUS THIS FILE'S OWN BACKFILL. NO FIXTURE IS MADE.
-- -----------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  if public.price_for_duration(60) <> 150 or public.price_for_duration(90) <> 180
     or public.price_for_duration(null) <> 150 or public.price_for_duration(120) <> 180 then
    raise exception 'duration pricing: the mapping is wrong (60=%, 90=%, null=%, 120=%)',
      public.price_for_duration(60), public.price_for_duration(90),
      public.price_for_duration(null), public.price_for_duration(120);
  end if;

  if public.credit_seat_minutes() <> 90 then
    raise exception 'credit minutes: a credit buys % minutes', public.credit_seat_minutes();
  end if;

  select count(*) into v_n from public.games
   where price_czk is distinct from public.price_for_duration(duration_minutes);
  if v_n > 0 then
    raise exception 'duration pricing: % game(s) disagree with their length', v_n;
  end if;

  for v_n in
    select 1 from (values ('admin_create_game_v2'), ('admin_update_game')) t(fn)
     where (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = t.fn) not like '%price_for_duration%'
  loop
    raise exception 'duration pricing: a game writer still takes the price from its caller';
  end loop;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_booking_internal')
     not like '%credit_seat_minutes%' then
    raise exception 'credit minutes: create_booking_internal ignores the length';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'add_guests_with_credit')
     not like '%GAME_NOT_CREDIT_ELIGIBLE%' then
    raise exception 'credit minutes: the add-guests rail does not refuse a short game';
  end if;

  if not (public.app_capabilities() ->> 'durationPricing')::boolean then
    raise exception 'duration pricing: the capability flag is not set';
  end if;

  raise notice 'round 35 v5: price follows length, credit buys 90 minutes — drilled in supabase/tests/';
end $$;
