-- =============================================================================
-- Rollback for migration 40 — restores the un-gated refund and policy v1
--
-- This restores MIGRATION 33'S BODY VERBATIM, which is the version that was
-- live before the cutoff: batch-aware refunds, no lead-time gate. It is not
-- migration 6's, and rebuilding from that one would revert the expiry-laundering
-- fix along with the cutoff.
--
-- WHAT THIS CANNOT UNDO. Credit that was forfeited while the cutoff was in
-- force is not re-issued — there is no record of an intent to refund, only a
-- `booking_cancelled` event carrying `forfeited_czk`. If credit has to be
-- returned to anyone, that is `grant_credit` per player, by hand, from those
-- events. Stated here because a rollback that looks total and is not is worse
-- than one that says so.
-- =============================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.cancel_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking     public.bookings%rowtype;
  v_game        public.games%rowtype;
  v_player_id   uuid;
  v_credit      integer;
  v_lead_hours  numeric(6, 2);
  v_redemption  record;
  v_refunded    integer := 0;
  v_unexpiring  integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'no player row for the calling session';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.player_id <> v_player_id then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'cancel_booking cancels only the calling player''s own booking';
  end if;

  -- === LOCK ORDER: PLAYER FIRST, THEN GAME. Do not reorder. ===
  perform pg_advisory_xact_lock(hashtextextended(v_booking.player_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  select * into v_game    from public.games g    where g.id = v_booking.game_id;

  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'CANCEL_WINDOW_CLOSED'
      using detail = 'game status ' || v_game.status::text || ', starts_at ' || v_game.starts_at::text;
  end if;

  v_lead_hours := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  if v_booking.status = 'confirmed' then
    v_credit := v_booking.price_czk;
  else
    v_credit := v_booking.credit_applied_czk;
  end if;

  update public.bookings
     set status = 'cancelled',
         cancel_lead_hours = v_lead_hours
   where id = p_booking_id;

  if v_credit > 0 then
    for v_redemption in
      select cl.batch_id, -cl.delta_czk as amount_czk, b.expires_at
        from public.credit_ledger cl
        join public.credit_ledger b on b.id = cl.batch_id
       where cl.booking_id = p_booking_id
         and cl.reason = 'redemption'
         and cl.batch_id is not null
    loop
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id, batch_id)
      values (v_booking.player_id, v_redemption.amount_czk, 'cancellation_credit',
              p_booking_id, v_redemption.batch_id);
      v_refunded := v_refunded + v_redemption.amount_czk;
    end loop;

    v_unexpiring := v_credit - v_refunded;
    if v_unexpiring > 0 then
      insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
      values (v_booking.player_id, v_unexpiring, 'cancellation_credit', p_booking_id);
    end if;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object(
              'amount_czk', v_credit,
              'reason', 'cancellation_credit',
              'returned_to_batches_czk', v_refunded),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_cancelled', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'previous_status', v_booking.status),
          v_game.city, v_game.brand);

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('previous_status', v_booking.status),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id, 'cancelled'::public.booking_status, v_credit, v_lead_hours)::public.cancel_result;
end $$;

revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated, service_role;

comment on function public.cancel_booking(uuid) is
  'Owner-only cancellation. Issues cancellation_credit for money actually '
  'applied (QR, cash and credit alike); an unpaid reservation issues none. '
  'Refunds pass credit to the batch it came from, with that batch''s expiry. '
  'Money never leaves the system. Lock order: player, then game.';

alter table public.events         alter column policy_version set default 'v1';
alter table public.credit_topups  alter column policy_version set default 'v1';
