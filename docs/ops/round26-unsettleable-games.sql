-- =============================================================================
-- Round 26 item 2 — the games that cannot be settled. OWNER RUNS THIS.
--
-- ROW 184. `settle_game` refuses while any booking on a game is still
-- `reserved`, and seven played games each carry at least one. Eleven rows in
-- total, 1,780 CZK of unpaid holds, the oldest from 2026-08-01.
--
-- NONE OF THIS IS A BUG. Every row is a real hold somebody made and nobody
-- resolved: a cash booking never confirmed on the pitch, or a QR booking never
-- paid. Round 26 stops the set GROWING — pay-first creates no unpaid booking
-- at all — and this clears what accumulated before it.
--
-- IT IS NOT ONE DECISION. Each row is either "they paid on the pitch and
-- nobody pressed the button" or "they never paid". The first is a
-- `confirm_booking`; the second is an `admin_remove_booking`, which also
-- credits anything the wallet had already put in. **Only you know which.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. READ THIS FIRST — exactly which rows block which games
-- -----------------------------------------------------------------------------
select g.starts_at::date            as game_date,
       g.venue,
       g.status                     as game_status,
       p.nickname,
       b.payment_method,
       b.price_czk,
       b.credit_applied_czk         as already_from_wallet,
       b.attendance,
       b.id                         as booking_id,
       g.id                         as game_id
  from public.bookings b
  join public.games   g on g.id = b.game_id
  join public.players p on p.id = b.player_id
 where b.status = 'reserved'
   and g.status in ('played', 'settled')
 order by g.starts_at, p.nickname;

-- And the games, so you can see how many holds each one is waiting on.
select g.starts_at::date as game_date, g.venue, count(*) as holds_blocking_settlement
  from public.bookings b
  join public.games g on g.id = b.game_id
 where b.status = 'reserved' and g.status in ('played', 'settled')
 group by 1, 2, g.id
 order by 1;

-- -----------------------------------------------------------------------------
-- 2. RESOLVE, ONE ROW AT A TIME
--
-- Both of these are the product's own RPCs, called as an admin — never a direct
-- UPDATE. `bookings` is written only through functions that emit their events
-- and take their locks, and a hand-written UPDATE would leave the log lying
-- about what happened.
--
-- Run them from the SQL editor while signed in as an admin, or from the admin
-- game page, which is the same call with a button on it.
-- -----------------------------------------------------------------------------

-- THEY PAID ON THE PITCH. Marks it confirmed and records the payment.
-- Signature verified against production on 2026-09-06:
--   confirm_booking(p_booking_id uuid, p_confirmed_by uuid, p_received_amount_czk integer)
--
--   select public.confirm_booking(
--            '<booking_id>'::uuid,
--            '<your player id>'::uuid,   -- who confirmed it; null is accepted
--            <amount_they_paid>);        -- null means "the full price"

-- THEY NEVER PAID. Cancels the hold and credits back anything the wallet had
-- already contributed — `already_from_wallet` in the SELECT above. A row with
-- 0 there costs the player nothing.
--   select public.admin_remove_booking('<booking_id>'::uuid);

-- -----------------------------------------------------------------------------
-- 3. THEN SETTLE. Each game, once its holds are gone.
--
--   select public.settle_game('<game_id>'::uuid);
--
-- It refuses with RESERVED_BOOKINGS_REMAIN if one is left, which is the check
-- doing its job rather than an error.
-- -----------------------------------------------------------------------------

-- Should return no rows when you are done.
select g.starts_at::date as still_blocked, g.venue, count(*) as remaining_holds
  from public.bookings b
  join public.games g on g.id = b.game_id
 where b.status = 'reserved' and g.status in ('played', 'settled')
 group by 1, 2, g.id
 order by 1;
