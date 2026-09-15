-- =============================================================================
-- ROUND 35 v2, ITEM 8 — a player can be banned, and unbanned.
--
-- ROW 11 WAKES UP. It was quarantined behind "backend capability it does not
-- have"; the pre-launch ruling removes the reason to build it carefully around
-- existing data, so it gets built simply instead.
--
-- THREE THINGS HAPPEN AT ONCE and they are one transaction on purpose: a ban
-- that blocks the account but leaves the seats, or frees the seats but leaves
-- the number, is a half-ban that reads as a bug.
--
--   (a) THE ACCOUNT IS BLOCKED. `players.banned_at` is the state, and
--       `current_player_id()` stops resolving for that session — which is the
--       chokepoint every state-bearing RPC in this schema already goes through,
--       so "cannot act" needs no new check in forty functions.
--   (b) THE PHONE NUMBER IS BANNED. `banned_phones` is its own table keyed on
--       the normalised number, because the ban has to outlive the row: the
--       point is that the same person cannot re-register, and re-registering
--       makes a NEW player row.
--   (c) FUTURE BOOKINGS ARE CANCELLED, seats released, `spot_released` emitted
--       so the waitlist machinery fires exactly as it does for any other
--       cancellation. Past games keep their roster — history is not a
--       punishment and removing it would rewrite other people's stats.
--
-- CREDITS FREEZE WITH THE ACCOUNT. Nothing is confiscated and nothing is
-- refunded: the ledger is untouched and the wallet is simply unreachable while
-- the account is. Unbanning restores it.
--
-- UNBAN IS THE REVERSE TOGGLE and it is deliberately NOT a full undo: access
-- comes back, the number is freed, and the cancelled bookings stay cancelled.
-- Re-seating somebody on a game that has since filled is not something this
-- function can promise, so it does not.
--
-- SHAPE ONLY AT THE FOOT. Nobody is banned by this file. The behaviour is
-- drilled in `supabase/tests/ban_profile.sql`, which `run.mjs` rolls back.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The state
-- -----------------------------------------------------------------------------

alter table public.players add column if not exists banned_at timestamptz;

comment on column public.players.banned_at is
  'When this account was banned, or null. A banned player cannot act: '
  'current_player_id() does not resolve for them.';

create table if not exists public.banned_phones (
  phone      text primary key,
  player_id  uuid references public.players(id) on delete set null,
  banned_at  timestamptz not null default now(),
  banned_by  uuid references public.players(id) on delete set null
);

comment on table public.banned_phones is
  'Phone numbers refused at signup. Keyed on the number rather than the player '
  'because the ban must outlive the row it came from — re-registering makes a '
  'new player.';

alter table public.banned_phones enable row level security;

/*
 * NO POLICY, WHICH MEANS NO ROW IS READABLE BY ANYBODY. RLS with no policy
 * denies everything, and that is the right answer here: a table of banned phone
 * numbers is the last thing to expose to a client. Every reader is a
 * `security definer` function below, and `is_phone_banned` answers a boolean
 * rather than handing back the list.
 */
grant select, insert, delete on public.banned_phones to service_role;

-- -----------------------------------------------------------------------------
-- 2. current_player_id STOPS RESOLVING FOR A BANNED PLAYER
--
-- THE ONE CHANGE THAT MAKES "CANNOT ACT" TRUE EVERYWHERE. Every state
-- transition in this schema begins by asking who is calling, and almost all of
-- them raise `INSUFFICIENT_PERMISSION` when the answer is null — so banning at
-- this level costs one substitution and covers `create_booking`,
-- `cancel_booking`, `join_waitlist`, `add_guests_with_credit`, the profile
-- writers and everything added later. A per-function check would be forty
-- places to forget one.
--
-- REWRITTEN IN PLACE, raising if the body is not what is expected — the same
-- mechanism rounds 33 and 35 used, and for the same reason: this function is
-- small but it is load-bearing, and editing what is INSTALLED beats pasting
-- over it.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'current_player_id';

  if v_def is null then
    raise exception 'ban: current_player_id is missing';
  end if;

  if position('banned_at' in v_def) > 0 then
    raise notice 'ban: current_player_id already refuses banned players';
  elsif position('auth_user_id = ' in v_def) = 0 then
    raise exception
      'ban: current_player_id does not look up by auth_user_id — the ban '
      'predicate must be re-derived against its actual body';
  else
    /*
     * `and banned_at is null` ON THE LOOKUP. A banned player's session is still
     * a valid Supabase session — we cannot revoke a JWT from here — but it
     * resolves to no player, which is the same thing every RPC already handles.
     */
    execute replace(
      v_def,
      'auth_user_id = ',
      'banned_at is null and auth_user_id = '
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Is this number banned?
-- -----------------------------------------------------------------------------

create or replace function public.is_phone_banned(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.banned_phones
     where phone = nullif(btrim(coalesce(p_phone, '')), '')
  )
$$;

revoke execute on function public.is_phone_banned(text) from public;
grant execute on function public.is_phone_banned(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. THE SIGNUP REFUSES A BANNED NUMBER
--
-- `complete_signup_v2` is where a phone number first reaches this schema, so it
-- is where the refusal belongs. `PHONE_BANNED` is a named error the surface can
-- render as a plain sentence — not "insufficient permission", which tells a
-- person nothing and reads as a bug.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := '  select u.email into v_email from auth.users u where u.id = v_uid;';
  v_new constant text :=
    E'  -- ROUND 35 v2: a banned number cannot register again. Checked here\n'
    '  -- because this is where a phone number first reaches the schema.\n'
    '  if public.is_phone_banned(nullif(btrim(coalesce(p_phone, '''''''')), '''''''')) then\n'
    '    raise exception ''PHONE_BANNED'';\n'
    '  end if;\n'
    '\n'
    '  select u.email into v_email from auth.users u where u.id = v_uid;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'complete_signup_v2';

  if v_def is null then
    raise exception 'ban: complete_signup_v2 is missing';
  end if;

  if position('PHONE_BANNED' in v_def) > 0 then
    raise notice 'ban: complete_signup_v2 already refuses a banned number';
  elsif position(v_old in v_def) = 0 then
    raise exception 'ban: complete_signup_v2 does not carry the expected email lookup';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. ban_player / unban_player
-- -----------------------------------------------------------------------------

create or replace function public.ban_player(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_player   public.players%rowtype;
  v_booking  public.bookings%rowtype;
  v_game     public.games%rowtype;
  v_cancelled integer := 0;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  v_actor := public.current_player_id();

  select * into v_player from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- AN ADMIN CANNOT BE BANNED, and cannot ban themselves. Same shape as
  -- `set_player_admin`'s own guard: a product that can lock every organizer out
  -- of its own admin panel has a failure mode with no way back.
  if v_player.is_admin then
    raise exception 'CANNOT_BAN_ADMIN';
  end if;

  if v_player.banned_at is not null then
    return 0;  -- already banned; idempotent, and no second event
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));

  update public.players set banned_at = now() where id = p_player_id;

  -- (b) THE NUMBER, if they have one. `on conflict do nothing` because two
  -- players can share a number in this schema and the second ban must not fail.
  if nullif(btrim(coalesce(v_player.phone, '')), '') is not null then
    insert into public.banned_phones (phone, player_id, banned_by)
    values (btrim(v_player.phone), p_player_id, v_actor)
    on conflict (phone) do nothing;
  end if;

  /*
   * (c) FUTURE BOOKINGS ONLY. `starts_at > now()` is the whole test: a game
   * that has kicked off keeps its roster, because the stats and the
   * players-met counts of everyone else on that pitch are built from it.
   *
   * NOT `cancel_booking`: that function is the PLAYER'S own path and checks
   * `current_player_id()`, which is now null for this player by definition.
   * The seats and the release event are what matter and they are done here,
   * under the same locks, in the same transaction as the ban.
   */
  for v_booking in
    select b.* from public.bookings b
      join public.games g on g.id = b.game_id
     where b.player_id = p_player_id
       and b.status in ('reserved', 'confirmed')
       and g.starts_at > now()
  loop
    select * into v_game from public.games where id = v_booking.game_id;

    update public.bookings set status = 'cancelled' where id = v_booking.id;

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('booking_cancelled', p_player_id, v_booking.game_id, v_booking.id,
            jsonb_build_object('reason', 'banned', 'by_player_id', v_actor,
                               'credit_issued_czk', 0,
                               'previous_status', v_booking.status),
            v_game.city, v_game.brand);

    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('spot_released', p_player_id, v_booking.game_id, v_booking.id,
            jsonb_build_object('previous_status', v_booking.status, 'reason', 'banned'),
            v_game.city, v_game.brand);

    perform public.sync_game_fullness(v_booking.game_id);
    v_cancelled := v_cancelled + 1;
  end loop;

  -- The waitlist entries go too: a banned player waiting for a seat would be
  -- notified and unable to claim it.
  delete from public.waitlist where player_id = p_player_id;

  insert into public.events (event_type, player_id, metadata)
  values ('player_banned', p_player_id,
          jsonb_build_object('by_player_id', v_actor,
                             'bookings_cancelled', v_cancelled,
                             'phone_banned', nullif(btrim(coalesce(v_player.phone, '')), '') is not null));

  return v_cancelled;
end;
$$;

create or replace function public.unban_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_player public.players%rowtype;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  v_actor := public.current_player_id();

  select * into v_player from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if v_player.banned_at is null then
    return;  -- not banned; idempotent, and no event
  end if;

  update public.players set banned_at = null where id = p_player_id;

  -- THE NUMBER IS FREED. Scoped to the rows THIS player's ban created, so
  -- unbanning one of two people who share a number does not free the other's.
  delete from public.banned_phones where player_id = p_player_id;

  /*
   * THE CANCELLED BOOKINGS STAY CANCELLED, which is the owner's ruling and is
   * also the only honest option: their seats were released, the waitlist was
   * told, and somebody else may be sitting in them.
   */
  insert into public.events (event_type, player_id, metadata)
  values ('player_unbanned', p_player_id,
          jsonb_build_object('by_player_id', v_actor));
end;
$$;

revoke execute on function public.ban_player(uuid) from public;
revoke execute on function public.unban_player(uuid) from public;
grant execute on function public.ban_player(uuid) to authenticated, service_role;
grant execute on function public.unban_player(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. The event catalog — two additions, a strict superset
-- -----------------------------------------------------------------------------

alter table public.events drop constraint if exists events_event_type_catalog;
alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    'account_created', 'auth_link_sent', 'auth_completed', 'player_claimed',
    'game_published', 'game_cancelled', 'game_settled', 'game_guests_changed',
    'game_deleted', 'booking_created', 'admin_booking_created',
    'booking_cancelled', 'booking_expired', 'spot_released',
    'admin_booking_removed', 'payment_confirmed', 'payment_unmatched',
    'credit_issued', 'credit_redeemed', 'credit_expired', 'topup_requested',
    'topup_confirmed', 'waitlist_joined', 'waitlist_notified',
    'waitlist_converted', 'waitlist_left', 'nudge_sent', 'reminder_sent',
    'attendance_marked', 'admin_granted', 'admin_revoked',
    'profile_photo_removed', 'player_anonymized', 'site_setting_changed',
    'venue_deleted', 'booking_guests_added', 'player_renamed',
    'booking_guests_removed',
    -- Round 35 v2, item 8.
    'player_banned', 'player_unbanned'
  )
);

-- -----------------------------------------------------------------------------
-- 7. The capability flag
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',          true,
    'dismissNotifications',   true,
    'adminRemoveBooking',     true,
    'adminDelete',            true,
    'cancelWithReason',       true,
    'gameLanguage',           true,
    'organizerTelegram',      true,
    'playersMet',             true,
    'playedSweep',            true,
    'playerNotifications',    true,
    'pendingSeatAnonymous',   true,
    'payFirstCheckout',       true,
    'addGuestsAfterBooking',  true,
    'publicProfileScope',     true,
    'creditLedgerNote',       true,
    'autoSettle',             true,

    -- Probed, not asserted: an out-of-order or partial apply cannot make one
    -- of these lie. Round 33's trap, closed in round 34.
    'adminRemoveCover',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'remove_profile_cover')),
    'venueMapUrl',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'map_url')),
    'playerNumbers',     to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'player_number')),
    'adminRenamePlayer', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_set_display_name')),
    'partyUpToThirteen', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'max_party_guests')),
    'cancelGuests',      to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')),
    'creditsAreSeats',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_seat_price_czk')),
    'seatsTakenMany',    to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'game_seats_taken_many')),
    'priceOneEighty',    to_jsonb(coalesce(
      (select public.credit_seat_price_czk() = 180), false)),
    'addGuestsConfirmation', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
        and p.parameter_name = 'guest_count')),

    -- Created by THIS file.
    'banProfile',        true
  )
$$;

-- -----------------------------------------------------------------------------
-- 8. VERIFICATION — SHAPE ONLY. NOBODY IS BANNED BY THIS FILE.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players' and column_name = 'banned_at'
  ) then
    raise exception 'ban: players.banned_at is missing';
  end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'banned_phones'
  ) then
    raise exception 'ban: banned_phones is missing';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'current_player_id') not like '%banned_at%' then
    raise exception 'ban: current_player_id still resolves a banned player';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'complete_signup_v2') not like '%PHONE_BANNED%' then
    raise exception 'ban: signup does not refuse a banned number';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'events_event_type_catalog') not like '%player_banned%' then
    raise exception 'ban: the event catalog was not widened';
  end if;

  if not (public.app_capabilities() ->> 'banProfile')::boolean then
    raise exception 'ban: the capability flag is not set';
  end if;

  raise notice 'ban: shape verified — behaviour is drilled in supabase/tests/ban_profile.sql';
end $$;
