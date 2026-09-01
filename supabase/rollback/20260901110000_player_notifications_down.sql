-- Rollback for 20260901110000_player_notifications.
--
-- DROP THE FLAG FIRST if running by hand: `playerNotifications` is what tells
-- the bell to render a `kind`. With it off the bell falls back to the stored
-- title and body, which is what every row said before this migration and what
-- an admin broadcast has always said.
--
-- ADDRESSED ROWS ARE DELETED, and it has to be that way round: dropping
-- `recipient_id` while leaving them would turn every private no-show warning
-- into a BROADCAST — the worst possible failure of this feature, performed by
-- its own undo. They go first.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true,
    'organizerTelegram', true,
    'playersMet', (
      select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'players_met'),
    'playedSweep', (
      select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'advance_played_games')
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

delete from public.notifications where recipient_id is not null;

drop function if exists public.notify_player(uuid, text, text, text, uuid);

-- `mark_attendance` goes back to the body it had before the bell hook. Restated
-- because there is nowhere else to restore it from.
create or replace function public.mark_attendance(
  p_booking_id uuid,
  p_attendance public.attendance_status
)
returns public.attendance_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'mark_attendance requires an admin session or service role';
  end if;
  if p_attendance is null then raise exception 'INVALID_ATTENDANCE'; end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  update public.bookings set attendance = p_attendance where id = p_booking_id;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('attendance_marked', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'attendance', p_attendance::text,
            'marked_by', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  return p_attendance;
end;
$$;
grant execute on function public.mark_attendance(uuid, public.attendance_status)
  to authenticated, service_role;

-- The reader goes back to five columns and no filter.
drop function if exists public.my_notifications(integer);
create function public.my_notifications(p_limit integer default 20)
returns table (id uuid, title text, body text, created_at timestamptz, is_read boolean)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.title, n.body, n.created_at,
         (r.notification_id is not null) as is_read
    from public.notifications n
    left join public.user_notification_reads r
      on r.notification_id = n.id and r.player_id = public.current_player_id()
   where r.dismissed_at is null
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.my_notifications(integer) to anon, authenticated, service_role;

alter table public.notifications drop constraint if exists notifications_kind_catalog;
drop index if exists public.notifications_recipient_idx;
alter table public.notifications
  drop column if exists kind,
  drop column if exists booking_id,
  drop column if exists recipient_id;
