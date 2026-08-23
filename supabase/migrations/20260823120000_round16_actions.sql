-- =============================================================================
-- Round 16 — the state transitions items 11, 13, 17, 18 and 19 need
--
-- ONE FILE, NOT FIVE, because the owner applies these by hand in one sitting
-- and five commands in a chain is five chances to run four. Everything here is
-- additive: new functions, one new nullable column, one widened CHECK.
--
-- EVERY ONE OF THESE IS A STATE TRANSITION, so every one is a SECURITY DEFINER
-- plpgsql function with `search_path = ''` and schema-qualified references, and
-- every one authorizes INSIDE itself rather than trusting the route that calls
-- it. There are no new direct client writes.
--
-- -----------------------------------------------------------------------------
-- THE CAPABILITY FUNCTION IS THE POINT OF THE SHAPE.
--
-- The owner cannot apply this tonight, and the code ships first. Every control
-- these functions sit behind would otherwise be a button that 404s — which
-- round 12 already ruled against: "Confirm is never live with a dead path
-- behind it."
--
-- `app_capabilities()` is created by this migration, so its ABSENCE is the
-- signal. The application asks for it once per request; on a database without
-- this migration the call fails and every flag reads false, so the controls do
-- not render at all. On a database with it they render. One probe gates the
-- whole round rather than five, and there is no state where a control exists
-- and its function does not.
--
-- Rollback: supabase/rollback/20260823120000_round16_actions_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The event catalog, widened FIRST
--
-- `events_event_type_catalog` is a single CHECK and forgetting it fails at the
-- first WRITE rather than at the migration — naming a constraint that has
-- nothing to do with the feature. It has been missed once already (migration
-- 24). Postgres cannot extend a CHECK in place, so this drops and re-adds with
-- the list restated in full; pre-approved (CLAUDE.md, 2026-08-01) while the new
-- list is a strict superset, and it is: four additions, nothing removed.
-- -----------------------------------------------------------------------------
alter table public.events drop constraint events_event_type_catalog;

alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    -- identity / auth
    'account_created', 'auth_link_sent', 'auth_completed', 'player_claimed',
    -- games
    'game_published', 'game_cancelled', 'game_settled', 'game_guests_changed',
    'game_deleted',
    -- bookings
    'booking_created', 'admin_booking_created', 'booking_cancelled',
    'booking_expired', 'spot_released', 'admin_booking_removed',
    -- payments / credit
    'payment_confirmed', 'payment_unmatched', 'credit_issued', 'credit_redeemed',
    'credit_expired',
    -- top-ups
    'topup_requested', 'topup_confirmed',
    -- waitlist
    'waitlist_joined', 'waitlist_notified', 'waitlist_converted', 'waitlist_left',
    -- sweeps
    'nudge_sent', 'reminder_sent',
    -- admin
    'attendance_marked', 'admin_granted', 'admin_revoked',
    'profile_photo_removed', 'player_anonymized', 'site_setting_changed',
    'venue_deleted'
  )
);

-- -----------------------------------------------------------------------------
-- 2. Item 11 — a player leaves a waitlist they joined
--
-- WHY AN RPC AND NOT A DELETE GRANT. `authenticated` holds no DELETE on
-- `waitlist` and is not getting one: the row carries a position other people's
-- expectations depend on, and every other transition in this product goes
-- through a function that logs what happened. A grant would be the only write
-- path with no event behind it.
--
-- IDEMPOTENT BY DESIGN. Returns false rather than raising when there is
-- nothing to remove — a player double-tapping "leave" is not an error, and the
-- second tap must not produce a red box.
-- -----------------------------------------------------------------------------
create or replace function public.leave_waitlist(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_game      public.games%rowtype;
  v_removed   integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'no player for this session';
  end if;

  delete from public.waitlist
   where game_id = p_game_id and player_id = v_player_id;

  get diagnostics v_removed = row_count;
  if v_removed = 0 then
    return false;
  end if;

  select * into v_game from public.games g where g.id = p_game_id;

  insert into public.events (event_type, player_id, game_id, city, brand)
  values ('waitlist_left', v_player_id, p_game_id,
          coalesce(v_game.city, 'prague'), coalesce(v_game.brand, 'hrajfotbal'));

  return true;
end
$$;

revoke execute on function public.leave_waitlist(uuid) from public;
grant execute on function public.leave_waitlist(uuid) to authenticated, service_role;

comment on function public.leave_waitlist(uuid) is
  'Removes the caller''s own waitlist entry for a game. Returns false when '
  'there was nothing to remove, so a double tap is a no-op rather than an error.';

-- -----------------------------------------------------------------------------
-- 3. Item 13 — "Clear all" on the bell
--
-- DISMISSAL IS NOT READ, and the column is separate for that reason. Opening
-- the bell marks everything read and the list stays — which is right, because
-- a notification you have seen is still a thing you may want to look at again.
-- "Clear all" is the player saying they are done with it, and only they can
-- say so.
--
-- REUSES `user_notification_reads` rather than adding a table. The row already
-- means "this player, this notification"; dismissal is a second timestamp on
-- the same fact, and a parallel table would need the same key, the same
-- cascade and the same RLS to express it.
-- -----------------------------------------------------------------------------
alter table public.user_notification_reads
  add column if not exists dismissed_at timestamptz;

comment on column public.user_notification_reads.dismissed_at is
  'When the player cleared this notification from their bell. Distinct from '
  'read_at: read is "I have seen it", dismissed is "stop showing me".';

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

  /*
   * UPSERT ACROSS EVERY NOTIFICATION, not only the ones already read. A player
   * who has never opened the bell and presses Clear all means the same thing
   * as one who has, and reading first would leave the unread ones behind —
   * which is exactly the set they were trying to be rid of.
   */
  insert into public.user_notification_reads (player_id, notification_id, dismissed_at)
  select v_player_id, n.id, now()
    from public.notifications n
      on conflict (player_id, notification_id)
      do update set dismissed_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.dismiss_all_notifications() from public;
grant execute on function public.dismiss_all_notifications() to authenticated, service_role;

-- `my_notifications` now hides what was dismissed. Restated in full rather than
-- patched: `create or replace` needs the whole body, and a half-remembered
-- rewrite is how round 13 silently changed three unrelated branches of
-- `set_site_setting`.
create or replace function public.my_notifications(p_limit integer default 20)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz,
  is_read    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id,
         n.title,
         n.body,
         n.created_at,
         (r.notification_id is not null) as is_read
    from public.notifications n
    left join public.user_notification_reads r
      on r.notification_id = n.id
     and r.player_id = public.current_player_id()
   where r.dismissed_at is null
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function public.my_notifications(integer) from public;
grant execute on function public.my_notifications(integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Item 17 — an admin removes a player from a roster
--
-- THE MONEY RULE IS `cancel_game`'S, NOT `cancel_booking`'S, and the owner
-- asked for no new money behaviour, so this picks between the two that exist
-- rather than inventing a third.
--
--   `cancel_booking` applies the lateness forfeit, because the PLAYER chose to
--   leave and the cutoff is the cost of choosing late.
--   `cancel_game` credits in full whatever the lead time, because the player
--   chose nothing.
--
-- An admin removal is the second shape: the player is losing a seat they
-- wanted, by somebody else's decision. Forfeiting their credit on top would
-- charge them for an action they did not take.
-- -----------------------------------------------------------------------------
create or replace function public.admin_remove_booking(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_game    public.games%rowtype;
  v_credit  integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.game_id::text, 0));

  -- Re-read under the lock: a concurrent cancellation may have settled it
  -- between the check above and here.
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.status not in ('reserved', 'confirmed') then
    raise exception 'INVALID_TRANSITION'
      using detail = 'booking status is ' || v_booking.status::text;
  end if;

  select * into v_game from public.games g where g.id = v_booking.game_id;

  if v_booking.status = 'confirmed' then
    v_credit := v_booking.price_czk;
  else
    v_credit := v_booking.credit_applied_czk;
  end if;

  update public.bookings
     set status = 'cancelled',
         cancel_lead_hours =
           round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2)
   where id = p_booking_id;

  if v_credit > 0 then
    insert into public.credit_ledger (player_id, delta_czk, reason, booking_id)
    values (v_booking.player_id, v_credit, 'cancellation_credit', p_booking_id);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('credit_issued', v_booking.player_id, v_booking.game_id, p_booking_id,
            jsonb_build_object('amount_czk', v_credit, 'reason', 'admin_removed'),
            v_game.city, v_game.brand);
  end if;

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('admin_booking_removed', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('credit_issued_czk', v_credit), v_game.city, v_game.brand);

  -- The seat is free again, so the fullness flag and the waitlist both matter.
  perform public.sync_game_fullness(v_booking.game_id);

  return v_credit;
end
$$;

revoke execute on function public.admin_remove_booking(uuid) from public;
grant execute on function public.admin_remove_booking(uuid) to authenticated, service_role;

comment on function public.admin_remove_booking(uuid) is
  'Admin releases a player''s seat. Credits in full regardless of lead time — '
  'the cancel_game rule, not the cancel_booking one, because the player did '
  'not choose this. Returns the credit issued in CZK.';

-- -----------------------------------------------------------------------------
-- 5. Item 18 — deleting a venue and deleting a game
--
-- BOTH REFUSE RATHER THAN CASCADE, and that is the whole design. A venue with
-- games and a game with bookings are records other rows and other people
-- depend on; deleting them quietly is how a ledger loses the thing it is keyed
-- to. The UI warns, and these refuse — the refusal is the guarantee, because
-- the UI is skipped by anyone using curl.
--
-- A GAME WITH BOOKINGS MUST BE CANCELLED FIRST. `cancel_game` credits everyone
-- through the existing loop; only then is there nothing left to lose. Deleting
-- a cancelled game with cancelled bookings is still refused — those rows are
-- the ledger's audit trail. What deletes is an EMPTY game: one nobody ever
-- booked.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game     public.games%rowtype;
  v_bookings integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  select count(*) into v_bookings from public.bookings b where b.game_id = p_game_id;

  if v_bookings > 0 then
    raise exception 'GAME_HAS_BOOKINGS'
      using detail = v_bookings::text || ' booking(s) — cancel the game first';
  end if;

  delete from public.waitlist where game_id = p_game_id;

  /*
   * THE EVENT IS WRITTEN BEFORE THE DELETE, and its `game_id` is deliberately
   * NOT set: `events.game_id` references `games`, so a row pointing at a game
   * about to disappear would either block the delete or be cascaded away with
   * it — and the audit trail for a deletion is the one that must outlive the
   * thing deleted. The id goes in the metadata instead, where nothing
   * references it.
   */
  insert into public.events (event_type, metadata, city, brand)
  values ('game_deleted',
          jsonb_build_object('game_id', p_game_id, 'venue', v_game.venue,
                             'starts_at', v_game.starts_at, 'status', v_game.status),
          v_game.city, v_game.brand);

  delete from public.events where game_id = p_game_id;
  delete from public.games where id = p_game_id;
end
$$;

revoke execute on function public.admin_delete_game(uuid) from public;
grant execute on function public.admin_delete_game(uuid) to authenticated, service_role;

create or replace function public.admin_delete_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
  v_games integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into v_venue from public.venues v where v.id = p_venue_id;
  if not found then raise exception 'VENUE_NOT_FOUND'; end if;

  select count(*) into v_games from public.games g where g.venue_id = p_venue_id;

  if v_games > 0 then
    raise exception 'VENUE_HAS_GAMES'
      using detail = v_games::text || ' game(s) reference this venue';
  end if;

  insert into public.events (event_type, metadata, city, brand)
  values ('venue_deleted',
          jsonb_build_object('venue_id', p_venue_id, 'name', v_venue.name),
          v_venue.city, v_venue.brand);

  delete from public.venues where id = p_venue_id;
end
$$;

revoke execute on function public.admin_delete_venue(uuid) from public;
grant execute on function public.admin_delete_venue(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Item 19 — cancelling a game carries a written reason
--
-- A SECOND FUNCTION, NOT A CHANGED SIGNATURE. The one-argument `cancel_game`
-- stays exactly as it is, because the deployed application calls it and this
-- migration lands hours after that deploy — dropping it would break
-- cancellation for the length of that gap. The new one is what the UI switches
-- to once `app_capabilities()` says it exists.
--
-- IT DELEGATES rather than reimplementing the loop. Every credit rule, every
-- event and the waitlist clear stay in one place; this adds the reason to the
-- `game_cancelled` event and publishes the broadcast notification.
--
-- THE NOTIFICATION IS A BROADCAST, and row 89 is why. The store has no
-- per-player recipient, so "everyone who was booked" cannot be addressed —
-- what CAN be said truthfully is a public announcement naming the game and the
-- reason, which is what a cancelled fixture is anyway. The per-player half is
-- the email, which the application sends on the path it already uses.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_game_with_reason(
  p_game_id uuid,
  p_reason  text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game   public.games%rowtype;
  v_reason text;
  v_count  integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  if length(v_reason) > 500 then
    raise exception 'REASON_TOO_LONG';
  end if;

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  -- The loop, the credits, the waitlist clear and the status change.
  v_count := public.cancel_game(p_game_id);

  /*
   * THE REASON GOES ON THE EVENT `cancel_game` JUST WROTE rather than onto a
   * second one. Two `game_cancelled` rows for one cancellation would make the
   * count of cancellations wrong for anybody reading the log, which is the
   * one thing an audit trail must not be.
   */
  update public.events
     set metadata = metadata || jsonb_build_object('reason', v_reason)
   where event_type = 'game_cancelled'
     and game_id = p_game_id
     and created_at >= now() - interval '1 minute';

  -- The public announcement. Titles and bodies are plain text; the reason is
  -- an admin's own words and is stored verbatim.
  insert into public.notifications (title, body)
  values (
    'Game cancelled — ' || v_game.venue,
    to_char(v_game.starts_at at time zone 'Europe/Prague', 'Dy DD Mon, HH24:MI')
      || E'\n' || v_reason
  );

  return v_count;
end
$$;

revoke execute on function public.cancel_game_with_reason(uuid, text) from public;
grant execute on function public.cancel_game_with_reason(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. The capability probe
--
-- See the header. Its ABSENCE is what tells the application this migration has
-- not run, so it must be created by this migration and by nothing else.
--
-- `stable` and SECURITY INVOKER: it reads nothing and reveals nothing beyond
-- which features are switched on, which every player discovers by looking at
-- the page.
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',      true,
    'dismissNotifications', true,
    'adminRemoveBooking', true,
    'adminDelete',        true,
    'cancelWithReason',   true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

comment on function public.app_capabilities() is
  'Which round-16 actions this database supports. Read once per request; its '
  'ABSENCE means the round-16 migration has not been applied, and every '
  'control it gates stays hidden rather than 404ing.';

-- -----------------------------------------------------------------------------
-- Verification — same transaction as the migration.
-- -----------------------------------------------------------------------------
do $ver$
declare
  v_caps jsonb;
  v_name text;
begin
  foreach v_name in array array[
    'leave_waitlist', 'dismiss_all_notifications', 'admin_remove_booking',
    'admin_delete_game', 'admin_delete_venue', 'cancel_game_with_reason',
    'app_capabilities'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    ) then
      raise exception '% was not created', v_name;
    end if;
  end loop;

  -- The one-argument cancel_game MUST survive: the deployed application calls
  -- it, and this migration lands after that deploy.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cancel_game'
       and pg_get_function_identity_arguments(p.oid) = 'p_game_id uuid'
  ) then
    raise exception 'the single-argument cancel_game was removed — the deployed app calls it';
  end if;

  select public.app_capabilities() into v_caps;
  if (v_caps ->> 'leaveWaitlist') is distinct from 'true' then
    raise exception 'app_capabilities did not report the round-16 flags';
  end if;

  -- Every new event type must pass the widened catalog. Asserted by INSERTING
  -- one of each and rolling it back — a CHECK that lists a value and a CHECK
  -- that accepts it are not the same thing when the list was retyped by hand.
  insert into public.events (event_type, metadata)
  values ('waitlist_left', '{}'::jsonb), ('admin_booking_removed', '{}'::jsonb),
         ('game_deleted', '{}'::jsonb), ('venue_deleted', '{}'::jsonb);
  delete from public.events
   where event_type in ('waitlist_left', 'admin_booking_removed', 'game_deleted', 'venue_deleted')
     and metadata = '{}'::jsonb;

  raise notice 'round 16 actions verified: 7 functions, 4 new event types, capabilities on';
end
$ver$;
