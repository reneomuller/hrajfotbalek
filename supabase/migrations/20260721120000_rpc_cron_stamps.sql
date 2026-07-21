-- =============================================================================
-- Migration 13 — mark_nudged / mark_reminder_sent (service-role only)
--
-- Both stamps go through an RPC rather than route code, for one reason worth
-- stating plainly: the stamped column IS the idempotency guard. A route that
-- updates `nudge_sent_at` and then inserts `nudge_sent` has a window where the
-- two disagree — and a stamp that lands without its event means the booking
-- looks already-processed while its email was never sent. That failure is
-- invisible in production: no error, no retry, one player silently skipped.
--
-- The policy window arrives as an ARGUMENT from lib/policy.ts rather than being
-- written into the SQL, so a v2 policy stays a config bump.
--
-- Rollback: supabase/rollback/20260721120000_rpc_cron_stamps_down.sql
-- =============================================================================

-- Returns true when this call did the stamping, false when it was already
-- stamped. The caller uses that to decide whether to send an email, so an
-- already-nudged booking cannot be mailed twice.
create function public.mark_nudged(p_booking_id uuid, p_grace_hours integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'mark_nudged is callable only from a service-role context';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_booking_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Only an unpaid reservation can be nudged. Nudging a player who already
  -- paid would be a trust-destroying bug: prepaying is spot insurance.
  if v_booking.status <> 'reserved' then
    return false;
  end if;

  -- The guard lives HERE, not only in the route's WHERE clause. Two concurrent
  -- sweeps both selecting the same row still produce exactly one stamp.
  if v_booking.nudge_sent_at is not null then
    return false;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  update public.bookings
     set nudge_sent_at = now(),
         -- What the expiry sweep later acts on. The two routes form a chain:
         -- nudge sets the deadline, expiry enforces it.
         expires_at = now() + make_interval(hours => p_grace_hours)
   where id = p_booking_id;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('nudge_sent', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('grace_hours', p_grace_hours),
          v_game.city, v_game.brand);

  return true;
end;
$$;

create function public.mark_reminder_sent(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'mark_reminder_sent is callable only from a service-role context';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_booking_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Reminders go to everyone still holding a spot, paid or not.
  if v_booking.status not in ('reserved', 'confirmed') then
    return false;
  end if;

  if v_booking.reminder_sent_at is not null then
    return false;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  update public.bookings
     set reminder_sent_at = now()
   where id = p_booking_id;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('reminder_sent', v_booking.player_id, v_booking.game_id, p_booking_id,
          '{}'::jsonb, v_game.city, v_game.brand);

  return true;
end;
$$;

revoke execute on function public.mark_nudged(uuid, integer) from public;
revoke execute on function public.mark_nudged(uuid, integer) from anon, authenticated;
grant execute on function public.mark_nudged(uuid, integer) to service_role;

revoke execute on function public.mark_reminder_sent(uuid) from public;
revoke execute on function public.mark_reminder_sent(uuid) from anon, authenticated;
grant execute on function public.mark_reminder_sent(uuid) to service_role;

comment on function public.mark_nudged(uuid, integer) is
  'Service-role only. Stamps nudge_sent_at and expires_at = now() + grace, and '
  'emits nudge_sent — one transaction. Returns false when already stamped or '
  'not reserved, so the caller sends no email.';

comment on function public.mark_reminder_sent(uuid) is
  'Service-role only. Stamps reminder_sent_at and emits reminder_sent in one '
  'transaction. Returns false when already stamped or the booking is inactive.';
