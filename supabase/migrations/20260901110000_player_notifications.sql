-- =============================================================================
-- Round 24 item 2 — notifications get a recipient, and the first one to use it
--
-- LEDGER ROW 89, OPENED IN ROUND 12 AND CLOSED HERE. The bell's store has been
-- a broadcast since round 7: `notifications(title, body, audience)` with no
-- recipient, so "tell THIS player something" has been a schema change rather
-- than a cheap join — which is why the waitlist still notifies by email only
-- and why the FAQ says "emailed" rather than softening the claim.
--
-- THREE COLUMNS, ALL NULLABLE, AND THE BROADCAST IS THE DEFAULT.
--
--   `recipient_id`  NULL means everyone, which is exactly what every existing
--     row means today. No backfill, no rewrite, no behaviour change for the
--     rows already in the table — the new column simply does not apply to
--     them. A NOT NULL column with a sentinel would have needed both.
--
--   `booking_id`    what the notification is ABOUT, when it is about
--     something. It exists so a notification can be REPLACED rather than
--     merely followed: un-marking a no-show has to remove the warning, and
--     matching on (recipient, kind, booking) is how you find the one to
--     remove without a text comparison.
--
--   `kind`          the translation handle, and the reason this is not simply
--     "insert the sentence". There is no `players.locale` — the reader's
--     language is a COOKIE, a fact about a browser — so a stored sentence can
--     only ever be in one language, and this product has four. A kind lets the
--     bell render the reader's own copy out of `lib/strings.ts` at read time
--     and leaves `title`/`body` as the fallback for what they have always
--     been: an admin's free-text broadcast, which nobody translates because a
--     human wrote it in the language they meant.
--
-- THE FIRST CONSUMER IS THE NO-SHOW WARNING, in `mark_attendance`. Marking a
-- player absent now tells that player, in their own language, in the bell they
-- already have. Un-marking removes the warning and leaves a short correction
-- in its place — a silent retraction would let somebody who saw the first
-- message keep believing it.
--
-- NO EMAIL. Not here and not by omission: email has no per-player language
-- either, and a no-show warning is precisely the message that must not arrive
-- in the wrong one. The bell reads the cookie of the person looking at it.
--
-- Rollback: supabase/rollback/20260901110000_player_notifications_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The store
-- -----------------------------------------------------------------------------
alter table public.notifications
  add column if not exists recipient_id uuid references public.players(id) on delete cascade,
  add column if not exists booking_id   uuid references public.bookings(id) on delete cascade,
  add column if not exists kind         text;

/*
 * THE KIND CATALOG IS A CHECK, and the same rule the event catalog has taught
 * this repo three times applies: a migration that emits a NEW kind widens this
 * in the same migration, by dropping and re-adding with the list restated in
 * full. Postgres cannot extend a CHECK in place.
 *
 * NULL is legal and is what every existing row and every admin broadcast has:
 * no kind means "render title and body as written".
 */
alter table public.notifications drop constraint if exists notifications_kind_catalog;
alter table public.notifications add constraint notifications_kind_catalog check (
  kind is null or kind in ('no_show_warning', 'no_show_cleared')
);

-- A player's own notifications, newest first — the exact shape `my_notifications`
-- reads. The broadcast half is already covered by the created_at ordering on a
-- table this small.
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc)
  where recipient_id is not null;

comment on column public.notifications.recipient_id is
  'NULL means broadcast, which is what every row created before round 24 is.';
comment on column public.notifications.kind is
  'Translation handle. NULL means title/body are literal admin free text.';

-- -----------------------------------------------------------------------------
-- 2. Reading — the filter that makes a recipient mean anything
--
-- WITHOUT THIS THE COLUMN IS DECORATION. `my_notifications` selected every row
-- in the table; adding a recipient without narrowing the read would show one
-- player's warning to everybody, which is worse than not having the feature.
-- -----------------------------------------------------------------------------
-- DROPPED AND RECREATED, not replaced: the row shape grows a `kind` column and
-- Postgres refuses to change a function's return type in place.
drop function if exists public.my_notifications(integer);

create function public.my_notifications(p_limit integer default 20)
returns table (
  id uuid,
  title text,
  body text,
  kind text,
  created_at timestamptz,
  is_read boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id,
         n.title,
         n.body,
         n.kind,
         n.created_at,
         (r.notification_id is not null) as is_read
    from public.notifications n
    left join public.user_notification_reads r
      on r.notification_id = n.id
     and r.player_id = public.current_player_id()
   where r.dismissed_at is null
     -- Mine, or everyone's. A signed-out reader has no `current_player_id()`
     -- and therefore sees broadcasts only, which is what they saw before.
     and (n.recipient_id is null or n.recipient_id = public.current_player_id())
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function public.my_notifications(integer) from public;
grant execute on function public.my_notifications(integer) to anon, authenticated, service_role;

/*
 * READ AND DISMISS FOLLOW THE SAME FILTER, and it is not tidiness. Both write
 * one `user_notification_reads` row per notification IN THE TABLE — so without
 * the narrowing, pressing "Clear all" would write a row for every private
 * notification addressed to every other player. Nothing leaks (the read never
 * returns them), but the table grows by players × notifications and the rows
 * are meaningless.
 */
create or replace function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_written   integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'NOT_A_PLAYER'
      using detail = 'mark_notifications_read requires a completed player profile';
  end if;

  insert into public.user_notification_reads (player_id, notification_id)
  select v_player_id, n.id
    from public.notifications n
   where n.recipient_id is null or n.recipient_id = v_player_id
   on conflict (player_id, notification_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke execute on function public.mark_notifications_read() from public;
grant execute on function public.mark_notifications_read() to authenticated, service_role;

create or replace function public.dismiss_all_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_count     integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  insert into public.user_notification_reads (player_id, notification_id, dismissed_at)
  select v_player_id, n.id, now()
    from public.notifications n
   where n.recipient_id is null or n.recipient_id = v_player_id
      on conflict (player_id, notification_id)
      do update set dismissed_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.dismiss_all_notifications() from public;
grant execute on function public.dismiss_all_notifications() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Writing — one addressed notification
-- -----------------------------------------------------------------------------
create or replace function public.notify_player(
  p_player_id  uuid,
  p_title      text,
  p_body       text,
  p_kind       text default null,
  p_booking_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  -- Authorization lives INSIDE the function: a route guard is skipped by
  -- anyone using curl, and this one writes into somebody's bell.
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'notify_player requires an admin session or service role';
  end if;

  if p_player_id is null then
    raise exception 'NOTIFICATION_RECIPIENT_REQUIRED';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'NOTIFICATION_TITLE_REQUIRED';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'NOTIFICATION_BODY_REQUIRED';
  end if;

  insert into public.notifications (title, body, recipient_id, kind, booking_id)
  values (btrim(p_title), btrim(p_body), p_player_id, p_kind, p_booking_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.notify_player(uuid, text, text, text, uuid) from public;
grant execute on function public.notify_player(uuid, text, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. The first consumer — marking a no-show tells the player
--
-- `mark_attendance` restated in full: `create or replace` needs the whole body,
-- and the round-13 defect came from keeping a second hand-edited copy of a
-- function somewhere else.
--
-- ONLY ON A TRANSITION, in both directions. Re-marking a player absent who is
-- already absent writes nothing new — an organizer tidying a roster would
-- otherwise fill somebody's bell with the same warning five times.
-- -----------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_booking_id uuid,
  p_attendance public.attendance_status
)
returns public.attendance_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_before  public.attendance_status;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'mark_attendance requires an admin session or service role';
  end if;

  if p_attendance is null then
    raise exception 'INVALID_ATTENDANCE';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- A cancelled or expired booking was already settled by its own transition:
  -- the spot was released and any money already accounted for. Marking it
  -- present or absent now would add an attendance fact about a spot nobody
  -- held, and the no-show rate would count it.
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  v_before := v_booking.attendance;

  update public.bookings
     set attendance = p_attendance
   where id = p_booking_id;

  -- Same transaction as the write above. Re-marking is allowed (an organizer
  -- correcting themselves) and emits a second event: the log is append-only,
  -- so a correction is a new fact rather than an edit to an old one.
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('attendance_marked', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'attendance', p_attendance::text,
            'marked_by', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          v_game.city, v_game.brand);

  /*
   * THE BELL, ON THE TRANSITION ONLY (round 24, item 2).
   *
   * `title` and `body` are written in ENGLISH and are the fallback, not the
   * message: `kind` is what the bell renders from, in the reader's own
   * language. They are stored anyway so a row is legible in psql and so a
   * database whose reader predates the kind still says something true.
   */
  if p_attendance = 'no_show' and v_before is distinct from 'no_show' then
    perform public.notify_player(
      v_booking.player_id,
      'You were marked as a no-show',
      'You had a spot at ' || coalesce(v_game.venue, 'a game')
        || ' and did not turn up. Someone on the waitlist could have played. '
        || 'Cancel in advance next time and the spot goes back to them.',
      'no_show_warning',
      p_booking_id);

  elsif v_before = 'no_show' and p_attendance is distinct from 'no_show' then
    /*
     * REPLACED, NOT FOLLOWED. The warning is deleted and a correction takes
     * its place — a retraction that leaves the accusation in the list is not a
     * retraction, and a player who has already read the first one has no way
     * to know it was withdrawn.
     *
     * Scoped to this booking and this recipient, so correcting one game does
     * not clear a warning the same player earned at another.
     */
    delete from public.notifications
     where booking_id = p_booking_id
       and recipient_id = v_booking.player_id
       and kind = 'no_show_warning';

    perform public.notify_player(
      v_booking.player_id,
      'That no-show was removed',
      'The organizer corrected the roster. Nothing is held against you.',
      'no_show_cleared',
      p_booking_id);
  end if;

  return p_attendance;
end;
$$;

revoke execute on function public.mark_attendance(uuid, public.attendance_status) from public;
grant execute on function public.mark_attendance(uuid, public.attendance_status)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. The capability flag
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true,
    'organizerTelegram',    true,
    'playersMet',           (
      select count(*) > 0 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'players_met'
    ),
    'playedSweep',          (
      select count(*) > 0 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'advance_played_games'
    ),
    'playerNotifications',  true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps    jsonb;
  v_player  uuid;
  v_venue   uuid;
  v_game    uuid;
  v_booking uuid;
  v_warned  integer;
  v_cleared integer;
  v_broadcasts_before integer;
  v_broadcasts_after  integer;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'playerNotifications')::boolean, false) is not true then
    raise exception 'player notifications: the capability flag did not turn on';
  end if;

  -- EXISTING BROADCASTS ARE UNTOUCHED, which is the promise the nullable
  -- column makes. Counted before and after the probe below.
  select count(*) into v_broadcasts_before
    from public.notifications where recipient_id is null;

  select id into v_player from public.players where auth_user_id is not null order by created_at limit 1;
  if v_player is null then
    raise notice 'player notifications: no signed-up player here — shape checked, warning NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    insert into public.venues (name) values ('notify probe') returning id into v_venue;
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status)
         values ('notify probe', v_venue, now() - interval '2 days', 12, 150, 'played')
      returning id into v_game;
    insert into public.bookings (game_id, player_id, status, price_czk, payment_method)
         values (v_game, v_player, 'confirmed', 150, 'cash')
      returning id into v_booking;

    -- Marking absent writes exactly one addressed warning.
    perform public.mark_attendance(v_booking, 'no_show');
    select count(*) into v_warned from public.notifications
     where booking_id = v_booking and kind = 'no_show_warning' and recipient_id = v_player;
    if v_warned <> 1 then
      raise exception 'player notifications: expected 1 warning, got %', v_warned;
    end if;

    -- Marking absent AGAIN writes nothing: only transitions speak.
    perform public.mark_attendance(v_booking, 'no_show');
    select count(*) into v_warned from public.notifications
     where booking_id = v_booking and kind = 'no_show_warning';
    if v_warned <> 1 then
      raise exception 'player notifications: re-marking wrote a second warning (%)', v_warned;
    end if;

    -- Reversing REPLACES it.
    perform public.mark_attendance(v_booking, 'present');
    select count(*) into v_warned from public.notifications
     where booking_id = v_booking and kind = 'no_show_warning';
    select count(*) into v_cleared from public.notifications
     where booking_id = v_booking and kind = 'no_show_cleared' and recipient_id = v_player;
    if v_warned <> 0 then
      raise exception 'player notifications: the warning survived its reversal';
    end if;
    if v_cleared <> 1 then
      raise exception 'player notifications: expected 1 correction, got %', v_cleared;
    end if;

    select count(*) into v_broadcasts_after
      from public.notifications where recipient_id is null;
    if v_broadcasts_after <> v_broadcasts_before then
      raise exception 'player notifications: the broadcast rows changed (% -> %)',
        v_broadcasts_before, v_broadcasts_after;
    end if;

    raise exception 'notify_probe_rollback';
  exception
    when others then
      if sqlerrm <> 'notify_probe_rollback' then
        raise;
      end if;
      raise notice 'player notifications: exercised and undone — one warning, no repeats, replaced on reversal, broadcasts untouched';
  end;
end $$;
