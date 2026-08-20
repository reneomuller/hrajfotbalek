-- =============================================================================
-- Reprice open games to the flat 150 (round 8, item 1)
--
-- RUN BY THE OWNER. Not a migration: this is DATA, and it is deliberately not
-- in supabase/migrations/ where it would replay on every environment forever.
--
-- WHAT IT CHANGES: future games that nobody has money tied up in.
--
-- WHAT IT DELIBERATELY DOES NOT CHANGE, and why each exclusion is here:
--
--   * A GAME THAT HAS ALREADY STARTED. Repricing a played or settled game
--     rewrites what the record says was charged for it. The financials page
--     reads `price_czk` off the booking rows behind `payment_confirmed`
--     events, so moving a past price silently restates last month's revenue.
--     `starts_at > now()` is the guard, and it is the reason the statement
--     currently matches nothing on production — see the audit in the round 8
--     report.
--
--   * A GAME WITH A CONFIRMED BOOKING. Somebody paid 200. Changing the price
--     under a settled payment makes the booking disagree with the bank.
--
--   * A GAME WITH A RESERVED BOOKING. Somebody is holding a spot at 200 and
--     may be looking at a QR code for that amount right now.
--
--   * A GAME WITH CREDIT APPLIED, or any `credit_ledger` row against one of
--     its bookings. The ledger arithmetic was computed against 200; repricing
--     leaves a redemption that does not reconcile.
--
-- IDEMPOTENT: `price_czk <> 150` means a second run is a no-op.
--
-- DRY RUN FIRST. The select and the update share their WHERE clause verbatim,
-- so what the first prints is exactly what the second writes.
-- =============================================================================

-- ---------------------------------------------------------------- dry run ---
select g.id, g.starts_at, g.status, g.price_czk, g.venue
  from public.games g
 where g.price_czk <> 150
   and g.starts_at > now()
   and not exists (
     select 1
       from public.bookings b
       left join public.credit_ledger l on l.booking_id = b.id
      where b.game_id = g.id
        and (b.status in ('confirmed', 'reserved')
             or b.credit_applied_czk > 0
             or l.id is not null))
 order by g.starts_at;

-- ----------------------------------------------------------------- apply ---
-- update public.games g
--    set price_czk = 150
--  where g.price_czk <> 150
--    and g.starts_at > now()
--    and not exists (
--      select 1
--        from public.bookings b
--        left join public.credit_ledger l on l.booking_id = b.id
--       where b.game_id = g.id
--         and (b.status in ('confirmed', 'reserved')
--              or b.credit_applied_czk > 0
--              or l.id is not null));
