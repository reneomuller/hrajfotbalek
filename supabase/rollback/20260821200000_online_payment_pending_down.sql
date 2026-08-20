-- Rollback for 20260821200000_online_payment_pending.
--
-- Dropping `payment_pending_at` makes every unpaid online booking hold its
-- seats forever again, which is the bug this migration closed. Settle or
-- cancel outstanding pendings first.

drop function if exists public.retry_online_payment(uuid);
drop function if exists public.confirm_online_payment(uuid, text, integer);
drop function if exists public.create_booking(uuid, public.payment_method, uuid, uuid, integer, boolean);
drop function if exists public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean, integer, boolean);

-- The view and game_seats_taken must be restored from
-- 20260821100000_guests_and_parties.sql, sections 7-9, before the helper below
-- can be dropped.
drop function if exists public.booking_holds_seat(public.booking_status, timestamptz);
drop function if exists public.online_payment_window();

drop index if exists public.bookings_payment_attention_idx;
drop index if exists public.bookings_stripe_session_id_key;

alter table public.bookings
  drop column if exists payment_pending_at,
  drop column if exists stripe_session_id,
  drop column if exists payment_attention_at,
  drop column if exists payment_attention_reason;
