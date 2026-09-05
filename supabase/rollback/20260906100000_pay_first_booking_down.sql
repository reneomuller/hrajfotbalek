-- Rollback for 20260906100000_pay_first_booking.
--
-- IT PUTS THE HOLDS BACK, and there is no version that does not: pay-first is
-- an architecture, not a feature flag. Reversing it restores the thirty-minute
-- seat hold and every defect that grew out of it.
--
-- BOOKINGS CREATED BY THE WEBHOOK ARE LEFT ALONE. They are paid, confirmed
-- bookings and reversing this must never un-book somebody who paid.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true,
    'organizerTelegram', true, 'playersMet', true, 'playedSweep', true,
    'playerNotifications', true, 'pendingSeatAnonymous', true
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- The thirty-minute predicate, restored.
create or replace function public.booking_holds_seat(
  p_status public.booking_status, p_pending_at timestamptz)
returns boolean language sql immutable set search_path = ''
as $$
  select p_status in ('reserved', 'confirmed')
     and (p_status = 'confirmed'
          or p_pending_at is null
          or p_pending_at >= now() - public.online_payment_window());
$$;

create or replace function public.booking_is_named(
  p_status public.booking_status, p_pending_at timestamptz)
returns boolean language sql immutable set search_path = ''
as $$
  select p_status = 'confirmed'
      or (p_status = 'reserved' and p_pending_at is null);
$$;

alter table public.notifications drop constraint if exists notifications_kind_catalog;
alter table public.notifications add constraint notifications_kind_catalog check (
  kind is null or kind in ('no_show_warning', 'no_show_cleared')
);

drop function if exists public.mark_checkout_expired(text);
drop function if exists public.checkouts_to_expire(uuid);
drop function if exists public.settle_checkout_session(text, integer);
drop function if exists public.open_checkout(uuid, integer, text, integer);

-- The register goes last: dropping it while the functions above still
-- reference it would leave them broken rather than absent.
drop table if exists public.checkout_sessions;
