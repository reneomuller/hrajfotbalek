-- Rollback for 20260905100000_pending_seat_is_anonymous.
--
-- IT PUTS THE DEFECT BACK, and there is no version of this that does not: the
-- point of the migration is that the roster stops publishing a name for a
-- checkout in progress. Restoring the round-11 view restores the exposure.
-- Reverse it only to unblock something else, and go forward again quickly.
--
-- Bookings the sweep already expired are NOT un-expired. `expired` is a true
-- statement about an abandoned checkout, and reversing it would put rows back
-- in front of `settle_game` that it correctly refuses.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true,
    'organizerTelegram', true, 'playersMet', true, 'playedSweep', true,
    'playerNotifications', true
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

drop function if exists public.expire_pending_online_payments();

drop view if exists public.game_roster_public;

create view public.game_roster_public
with (security_invoker = false)
as
  select b.game_id, p.nickname, p.photo_path,
         (select count(*) from public.bookings b2
            join public.games g2 on g2.id = b2.game_id
           where b2.player_id = p.id
             and b2.status in ('reserved', 'confirmed')
             and g2.status in ('played', 'settled'))::integer as games_played,
         p.auth_user_id is null as is_guest,
         null::text as guest_of, null::integer as guest_index
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
