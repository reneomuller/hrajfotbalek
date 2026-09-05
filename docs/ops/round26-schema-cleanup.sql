-- =============================================================================
-- Round 26 — SCHEMA CLEANUP after pay-first. OWNER RUNS THIS. Never automatic.
--
-- RUN IT AFTER `20260906100000_pay_first_booking.sql` IS APPLIED AND THE DEPLOY
-- IS LIVE, and not before. Everything here removes machinery the deployed code
-- has already stopped using; running it against an older deploy would take
-- columns out from under code that still selects them.
--
-- NOTHING HERE IS URGENT. The residue is inert: a column that is always false,
-- a function nothing calls, a window nothing reads. This tidies; it does not
-- fix.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. WHAT IS ABOUT TO CHANGE — read this first
-- -----------------------------------------------------------------------------

-- Should be zero. A non-zero count means a booking still carries a payment
-- stamp, which under pay-first can only be a LEGACY row from before this round.
-- They are harmless — `booking_holds_seat` no longer reads the column — but see
-- step 3 before dropping it.
select count(*) as bookings_with_a_payment_stamp
  from public.bookings where payment_pending_at is not null;

-- The register, so you can see the shape of what replaced them.
select status, count(*) as sessions
  from public.checkout_sessions group by status order by 1;

-- -----------------------------------------------------------------------------
-- 2. The round-25 anonymity column
--
-- IT IS APPLIED ON PRODUCTION and it is now always false: pay-first means no
-- seat is ever held by an unpaid checkout, so there is nothing to anonymise.
-- The round-26 migration already made `booking_is_named` return true for every
-- seat that counts; this removes the column the view was projecting for it.
--
-- THE VIEW MUST BE RECREATED, not altered: a column cannot be dropped from a
-- view in place. Restated in full, which is the same rule the column-boundary
-- assertions in `supabase/tests/` enforce — and those two files have to be
-- edited in the same change, or the suite fails.
-- -----------------------------------------------------------------------------
drop view if exists public.game_roster_public;

create view public.game_roster_public
with (security_invoker = false)
as
  select b.game_id, p.nickname, p.photo_path,
         (select count(*)
            from public.bookings b2
            join public.games g2 on g2.id = b2.game_id
           where b2.player_id = p.id
             and b2.status in ('reserved', 'confirmed')
             and g2.status in ('played', 'settled'))::integer as games_played,
         p.auth_user_id is null as is_guest,
         null::text            as guest_of,
         null::integer         as guest_index
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
  union all
  select b.game_id, null::text, null::text, 0, true, p.nickname, seat.seat
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
    cross join lateral generate_series(1, b.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
     and b.guest_count > 0
  union all
  select g.id, null::text, null::text, 0, true, null::text, seat.seat
    from public.games g
    cross join lateral generate_series(1, g.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and g.guest_count > 0;

grant select on public.game_roster_public to anon, authenticated, service_role;

drop function if exists public.booking_is_named(public.booking_status, timestamptz);

-- -----------------------------------------------------------------------------
-- 3. The pending machinery
--
-- `payment_pending_at` IS KEPT. It is the only record that a legacy booking
-- came through the old rail, `retry_online_payment` and the round-15 return
-- page both read it historically, and dropping a column to tidy is how an
-- audit trail disappears. Nothing reads it for a decision any more.
--
-- The two functions below have no callers left in the deployed application.
-- -----------------------------------------------------------------------------
drop function if exists public.expire_pending_online_payments();
drop function if exists public.retry_online_payment(uuid);

-- `online_payment_window()` is kept: `booking_holds_seat`'s ROLLBACK restores a
-- body that calls it, and a rollback that fails on a missing function is not a
-- rollback.

-- -----------------------------------------------------------------------------
-- 4. Verify
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'game_roster_public'
                and column_name = 'is_pending') then
    raise exception 'cleanup: the roster still projects is_pending';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'expire_pending_online_payments') then
    raise exception 'cleanup: the online expiry sweep is still here';
  end if;

  raise notice 'cleanup: the roster is seven columns again and the pending machinery is gone';
end $$;
