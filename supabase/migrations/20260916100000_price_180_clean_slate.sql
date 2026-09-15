-- =============================================================================
-- ROUND 35 v2, ITEMS 2 AND 3 — the game costs 180, and every balance goes to
-- zero.
--
-- THE OWNER'S PRE-LAUNCH RULING, and it is what makes this file short: the site
-- is unpublished, every player row is test data, and there is no
-- backward-compatibility ceremony to perform. No preserved balances, no
-- grandfathered prices, no dual-price window. The simplest correct thing wins.
--
-- ONE SOURCE FOR THE PRICE, ON EACH SIDE. `credit_seat_price_czk()` is the
-- authority in SQL and `PASS_REFERENCE_PRICE_CZK` mirrors it for display —
-- the same shape as every policy window here. What this migration does that
-- round 35 v1 did not is KILL THE THIRD COPY: `pass_tiers_credited_rule` spelled
-- 150 as a literal inside a CHECK constraint, and last round I looked straight
-- at it and left it there. The crop-constant lesson applies to money.
--
-- SHAPE AND BACKFILL AT THE FOOT OF THIS FILE. A migration's verification block
-- may not write a row, but it MAY assert the result of a backfill the migration
-- itself performed — and this one is almost entirely backfill, so it does.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The price
-- -----------------------------------------------------------------------------

create or replace function public.credit_seat_price_czk()
returns integer
language sql
immutable
set search_path = ''
as $$ select 180 $$;

revoke execute on function public.credit_seat_price_czk() from public;
grant execute on function public.credit_seat_price_czk() to anon, authenticated, service_role;

comment on function public.credit_seat_price_czk() is
  'What one credit buys: one seat, flat, whatever a card would have paid. THE '
  'single source in SQL; lib/pass/creditPrice.ts mirrors it for display.';

-- -----------------------------------------------------------------------------
-- 2. THE THIRD COPY, KILLED
--
-- `check (credited_czk = games * 150)` was a literal in a constraint, which is
-- the worst place for one: it does not fail when the price moves, it fails the
-- next time somebody INSERTS a tier, and the error names a constraint rather
-- than a price. It now calls the function.
--
-- AN IMMUTABLE FUNCTION IS LEGAL IN A CHECK and this one is genuinely constant
-- between migrations — but Postgres does NOT re-validate existing rows when the
-- function's body changes, so a future price move must update `pass_tiers` in
-- the same migration that moves the function. This one does, three statements
-- below, and the verification at the foot proves the rows and the function
-- agree. That is the trade: a copy that cannot drift, for a rule that must be
-- re-satisfied deliberately.
-- -----------------------------------------------------------------------------

alter table public.pass_tiers drop constraint if exists pass_tiers_credited_rule;

-- -----------------------------------------------------------------------------
-- 3. THE PASS TABLE (item 3) — the owner's screenshot is the authority, and it
--    gives PRICES rather than percentages.
--
--     games   price    anchor (games x 180)   displayed
--         5     840                     900          -7 %
--         8   1,296                   1,440         -10 %
--        12   1,879                   2,160         -13 %
--        15   2,241                   2,700         -17 %
--        20   2,772                   3,600         -23 %
--
-- THE PERCENTAGES ARE NOT STORED AND MUST NOT BE. `PassTierCard` computes
-- `(anchor - price) / anchor` and rounds to a whole percent, so the five
-- numbers in the right-hand column are a CONSEQUENCE of the two on the left.
-- Storing them would be a fourth copy of the same fact, able to disagree with
-- the price it describes — and every one of the owner's five comes out exactly:
-- 6.67 rounds to 7, 10.0 to 10, 13.01 to 13, 17.0 to 17, 23.0 to 23.
--
-- `credited_czk` IS THE ANCHOR, which is what makes a pass a discount rather
-- than a different product: five games credits five games' worth and costs less
-- than five games.
-- -----------------------------------------------------------------------------

update public.pass_tiers set price_czk = 840,   credited_czk = 5  * 180 where games = 5;
update public.pass_tiers set price_czk = 1296,  credited_czk = 8  * 180 where games = 8;
update public.pass_tiers set price_czk = 1879,  credited_czk = 12 * 180 where games = 12;
update public.pass_tiers set price_czk = 2241,  credited_czk = 15 * 180 where games = 15;
update public.pass_tiers set price_czk = 2772,  credited_czk = 20 * 180 where games = 20;

alter table public.pass_tiers
  add constraint pass_tiers_credited_rule
  check (credited_czk = games * public.credit_seat_price_czk());

-- -----------------------------------------------------------------------------
-- 4. EVERY GAME REPRICES, PUBLISHED INCLUDED — no exceptions, which is the
--    owner's word and the whole point of doing it before launch.
--
-- A dual-price world is the thing being avoided: two players on the same pitch
-- owing different amounts because one booked on Tuesday. Unpublished means
-- nobody has really paid, so there is nothing to protect.
-- -----------------------------------------------------------------------------

update public.games set price_czk = public.credit_seat_price_czk();

-- -----------------------------------------------------------------------------
-- 5. EVERY WALLET GOES TO ZERO, AND HERE IS EXACTLY HOW
--
-- `delete from public.credit_ledger` — every row, not an offsetting entry per
-- player. The owner's ruling is that these are test artifacts, and the simplest
-- honest way to make a balance zero is for there to be no rows behind it. An
-- offsetting entry would leave a ledger telling a story about money that never
-- moved, which is worse than an empty one: append-only is a property worth
-- having about REAL history, and none of this is.
--
-- `bookings.credit_applied_czk` GOES WITH IT, and it has to. The column is a
-- claim that ledger rows exist; leaving it set against an empty ledger would
-- make the admin's outstanding figure under-report by exactly the amount it
-- claims was paid. A `reserved` booking therefore owes its full price again,
-- which is the truth once the credit behind it is gone.
--
-- WHAT IS DELIBERATELY NOT TOUCHED: `topups`. A confirmed top-up row is a
-- record that somebody said money arrived, and its ledger row is gone — so the
-- two now disagree. That is visible in the admin rather than hidden, it is test
-- data like everything else here, and inventing a rule for it would be the
-- ceremony this ruling exists to avoid. Named in the round report.
--
-- ROWS 244 AND THE STUB SAGA ARE MOOTED BY THIS: there are no ragged balances
-- left to be ragged, because there are no balances.
-- -----------------------------------------------------------------------------

delete from public.credit_ledger;

update public.bookings
   set credit_applied_czk = 0
 where credit_applied_czk <> 0;

-- -----------------------------------------------------------------------------
-- 6. The capability flag
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
    'cancelGuests',      to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')),
    'creditsAreSeats',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_seat_price_czk')),
    'seatsTakenMany',    to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'game_seats_taken_many')),
    'addGuestsConfirmation', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
        and p.parameter_name = 'guest_count')),

    -- Set by THIS file.
    'priceOneEighty',    true
  )
$$;

-- -----------------------------------------------------------------------------
-- 7. VERIFICATION — SHAPE, PLUS THE RESULT OF THIS FILE'S OWN BACKFILL.
--    NOT ONE FIXTURE IS CREATED.
-- -----------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  if public.credit_seat_price_czk() <> 180 then
    raise exception 'price 180: the seat price is %', public.credit_seat_price_czk();
  end if;

  select count(*) into v_n from public.games where price_czk <> 180;
  if v_n > 0 then
    raise exception 'price 180: % game(s) did not reprice', v_n;
  end if;

  select count(*) into v_n from public.pass_tiers
   where credited_czk <> games * public.credit_seat_price_czk();
  if v_n > 0 then
    raise exception 'price 180: % tier(s) disagree with the seat price', v_n;
  end if;

  -- The five prices, exactly as the owner gave them.
  if not (
    exists (select 1 from public.pass_tiers where games = 5  and price_czk = 840)
    and exists (select 1 from public.pass_tiers where games = 8  and price_czk = 1296)
    and exists (select 1 from public.pass_tiers where games = 12 and price_czk = 1879)
    and exists (select 1 from public.pass_tiers where games = 15 and price_czk = 2241)
    and exists (select 1 from public.pass_tiers where games = 20 and price_czk = 2772)
  ) then
    raise exception 'price 180: the pass table does not match the ruling';
  end if;

  select count(*) into v_n from public.credit_ledger;
  if v_n > 0 then
    raise exception 'clean slate: % ledger row(s) survived', v_n;
  end if;

  select count(*) into v_n from public.bookings where credit_applied_czk <> 0;
  if v_n > 0 then
    raise exception 'clean slate: % booking(s) still claim applied credit', v_n;
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'pass_tiers_credited_rule') not like '%credit_seat_price_czk%' then
    raise exception 'price 180: the tier CHECK still holds a literal';
  end if;

  raise notice 'round 35 v2: 180 everywhere, every wallet at zero — behaviour drilled in supabase/tests/';
end $$;
