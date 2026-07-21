-- =============================================================================
-- Migration 12 — notify_waitlist (service-role only)
--
-- Stamps `notified_at` on every active waitlisted player for a game and emits
-- ONE `waitlist_notified` event PER PLAYER, in a single transaction.
--
-- Why this cannot live in the cron route: `waitlist` is state-bearing, so a
-- TypeScript loop updating rows and inserting events alongside them gives no
-- guarantee the two agree. A crash midway leaves some players stamped with no
-- event and others notified with no stamp — and Phase 26's waitlist metrics
-- read the event log, so the damage is silent and permanent.
--
-- NOT filtered on a previous `notified_at`. Re-notification is intended: a
-- player who lost one race is notified again when the next spot opens.
-- `notified_at` records the LAST notification, it is not a suppression flag.
--
-- Rollback: supabase/rollback/20260721110000_rpc_notify_waitlist_down.sql
-- =============================================================================

create type public.waitlist_notification as (
  player_id   uuid,
  email       text,
  nickname    text,
  waitlist_id uuid
);

create function public.notify_waitlist(p_game_id uuid)
returns setof public.waitlist_notification
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_row  record;
begin
  -- Cron-driven sweep with no human caller. Service-role only.
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'notify_waitlist is callable only from a service-role context';
  end if;

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- Nobody is waiting for a game that is not going to take bookings.
  if v_game.status not in ('published', 'full') then
    return;
  end if;

  -- Game lock, so two concurrent releases on one game cannot interleave their
  -- stamps and events. No player lock is taken here: this function writes
  -- nothing player-scoped beyond the waitlist row it already owns.
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  for v_row in
    select w.id as waitlist_id, w.player_id, p.email, p.nickname
      from public.waitlist w
      join public.players p on p.id = w.player_id
     where w.game_id = p_game_id
       and w.converted_booking_id is null
     order by w.joined_at
  loop
    update public.waitlist
       set notified_at = now()
     where id = v_row.waitlist_id;

    -- One event per notified player, not one per fan-out: Phase 16's dispatch
    -- keys on this to send the spot-open email, and Phase 26 counts these rows
    -- per player.
    insert into public.events (event_type, player_id, game_id, metadata, city, brand)
    values ('waitlist_notified', v_row.player_id, p_game_id,
            jsonb_build_object('waitlist_id', v_row.waitlist_id),
            v_game.city, v_game.brand);

    return next (v_row.player_id, v_row.email, v_row.nickname, v_row.waitlist_id)::public.waitlist_notification;
  end loop;

  return;
end;
$$;

revoke execute on function public.notify_waitlist(uuid) from public;
revoke execute on function public.notify_waitlist(uuid) from anon, authenticated;
grant execute on function public.notify_waitlist(uuid) to service_role;

comment on function public.notify_waitlist(uuid) is
  'Service-role only. Stamps notified_at and emits one waitlist_notified event '
  'per active waitlisted player in one transaction, returning the players to '
  'mail. Deliberately does not filter on notified_at — re-notification is the '
  'intended behaviour when a second spot opens.';
