-- =============================================================================
-- ROUND 29 — AUTO-SETTLE, AND A ONE-TIME FIAT BACKFILL.
--
-- A RECORDED REVERSAL OF ROUND 24's GUARD, with its lineage, because an
-- unrecorded reversal gets reversed again by whoever next reads only this file:
--
--   ROUND 24 (item 1) built the daily sweep that moves a kicked-off game to
--     `played`, and drew a hard line at that point: "SETTLING REMAINS AN
--     EXPLICIT ADMIN ACT". `advance_played_games` grew a money invariant to
--     enforce it — the sweep counts `credit_ledger` and live bookings before
--     and after, and rolls the whole run back if either moved.
--   ROUND 29 removes the manual step. The premise that made settling a
--     judgement was CASH: a game could end with money uncollected on the
--     pitch, and only a person knew whether it had been handed over. Cash left
--     the flow in round 23, and pay-first (round 26) means a rostered player
--     has paid before the row exists. There is no longer a judgement to make.
--
-- ROUND 24'S REASONING IS NOT REFUTED — its premise expired. And the invariant
-- it built SURVIVES UNCHANGED and now guards more: `settle_game` moves no
-- money and touches no booking, so a sweep that settles must still show a
-- byte-identical ledger and an unchanged live-booking count. If auto-settle
-- ever starts moving money, this sweep rolls itself back and says so.
--
-- WHAT `settle_game` ACTUALLY DID, enumerated before anything was changed:
-- an admin/service_role check, an advisory lock, a `played`-only transition
-- guard, a count of `reserved` bookings that refuses when non-zero, one UPDATE
-- to `status`, and one `game_settled` event. **No attendance finalization, no
-- credit, no forfeiture, no money of any kind, and no triggers on `games`.**
-- Settling is a label on a row; everything downstream that reads it treats
-- `played` and `settled` identically (the roster view, `players_met`, the
-- public profile's stats, `lib/profile/stats.ts`). That is what makes a fiat
-- backfill safe rather than brave.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The sweep settles what it plays
--
-- RETURNS jsonb NOW, because one integer cannot carry the thing that matters:
-- how many games the tripwire SKIPPED. A skip is news (see below), and a sweep
-- that reports only a success count hides it.
-- -----------------------------------------------------------------------------
drop function if exists public.advance_played_games(integer);

create function public.advance_played_games(p_buffer_minutes integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `policy.game.durationMinutes`, restated. SQL cannot read a TypeScript
  -- module; if the two disagree, a game runs long and advances early, which is
  -- why the buffer exists on top of it.
  v_default_minutes constant integer := 60;

  v_buffer   integer := greatest(0, coalesce(p_buffer_minutes, 120));
  v_game     record;
  v_advanced integer := 0;
  v_settled  integer := 0;
  v_skipped  integer := 0;
  v_skips    uuid[] := '{}';
  v_reserved integer;

  -- The invariant's before-readings.
  v_ledger_before integer;
  v_ledger_after  integer;
  v_live_before   integer;
  v_live_after    integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'advance_played_games requires an admin session or service role';
  end if;

  select count(*) into v_ledger_before from public.credit_ledger;
  select count(*) into v_live_before
    from public.bookings where status in ('reserved', 'confirmed');

  /*
   * KICKOFF + DURATION + BUFFER. The buffer is not slack for the sweep's
   * schedule — it is for the GAME: a fixture that runs long, or one whose
   * `duration_minutes` is null and is therefore assumed to be an hour when it
   * was ninety minutes. Two hours is comfortably past both.
   *
   * `for update skip locked` so two overlapping cron runs cannot both pick up
   * the same game — the second simply sees fewer rows.
   */
  for v_game in
    select g.id
      from public.games g
     where g.status in ('published', 'full')
       and g.starts_at
           + make_interval(mins => coalesce(g.duration_minutes, v_default_minutes))
           + make_interval(mins => v_buffer)
           < now()
     order by g.starts_at
       for update skip locked
  loop
    begin
      perform public.mark_game_played(v_game.id);
      v_advanced := v_advanced + 1;
    exception
      when others then
        -- A game that raced to another status is not an error worth failing
        -- the sweep over. Swallowed per game rather than per run.
        null;
    end;
  end loop;

  /*
   * AND THEN SETTLE — every `played` game past its buffer, not only the ones
   * this run advanced.
   *
   * WHY NOT ONLY THIS RUN'S: a game the previous sweep advanced while a hold
   * was still open must settle once that hold is resolved, and a run that only
   * looked at its own work would leave it `played` for ever. The set is
   * therefore "everything that should be closed by now", which is also what
   * makes the backfill below a one-time event rather than a permanent
   * catch-up.
   *
   * THE RESERVED-ROWS CHECK STAYS, AS A TRIPWIRE RATHER THAN A GATE. Under
   * pay-first no rostered player can be unpaid, so this should never fire —
   * the one path that can still produce a `reserved` row is an admin creating
   * a booking by hand. A NON-EMPTY SKIP LINE IS NEWS, and it is reported
   * rather than raised: a game nobody can close is a thing to look at, not a
   * reason to abandon the rest of the sweep.
   */
  for v_game in
    select g.id
      from public.games g
     where g.status = 'played'
       and g.starts_at
           + make_interval(mins => coalesce(g.duration_minutes, v_default_minutes))
           + make_interval(mins => v_buffer)
           < now()
     order by g.starts_at
       for update skip locked
  loop
    select count(*) into v_reserved
      from public.bookings b
     where b.game_id = v_game.id and b.status = 'reserved';

    if v_reserved > 0 then
      v_skipped := v_skipped + 1;
      v_skips := v_skips || v_game.id;
      continue;
    end if;

    update public.games set status = 'settled' where id = v_game.id;

    insert into public.events (event_type, game_id, metadata, city, brand)
    select 'game_settled', g.id,
           jsonb_build_object('rail', 'sweep'), g.city, g.brand
      from public.games g where g.id = v_game.id;

    v_settled := v_settled + 1;
  end loop;

  /*
   * THE INVARIANT, AND ROUND 24 BUILT IT FOR EXACTLY THIS MOMENT.
   *
   * It was written to enforce "the sweep never settles". It now guards a sweep
   * that DOES settle, and it is the reason that is safe: settling is one
   * UPDATE to a status column and one event row, so the ledger and the live
   * booking count must come out byte-identical. If a later round adds a
   * trigger, an event handler, or a line that pays somebody on settlement,
   * this rolls the whole run back and names it.
   *
   * A COUNT IS ENOUGH because the ledger is append-only by privilege: nothing
   * can delete a row to hide behind an unchanged total.
   */
  select count(*) into v_ledger_after from public.credit_ledger;
  select count(*) into v_live_after
    from public.bookings where status in ('reserved', 'confirmed');

  if v_ledger_after <> v_ledger_before then
    raise exception 'PLAYED_SWEEP_MOVED_MONEY'
      using detail = 'credit_ledger changed from ' || v_ledger_before::text
                     || ' to ' || v_ledger_after::text
                     || ' while advancing games — settling must never move money';
  end if;

  if v_live_after <> v_live_before then
    raise exception 'PLAYED_SWEEP_MOVED_BOOKINGS'
      using detail = 'live bookings changed from ' || v_live_before::text
                     || ' to ' || v_live_after::text
                     || ' while advancing games';
  end if;

  return jsonb_build_object(
    'advanced', v_advanced,
    'settled',  v_settled,
    'skipped',  v_skipped,
    'skippedGameIds', to_jsonb(v_skips));
end;
$$;

revoke execute on function public.advance_played_games(integer) from public;
grant execute on function public.advance_played_games(integer) to authenticated, service_role;

comment on function public.advance_played_games(integer) is
  'The daily sweep: published/full -> played -> settled. Round 29 removed the '
  'manual settle step; the reserved-rows check survives as a tripwire that '
  'SKIPS and reports rather than refusing.';

-- -----------------------------------------------------------------------------
-- 2. Manual settling is gone
--
-- DROPPED RATHER THAN LEFT DORMANT. A function nobody calls is a function
-- somebody calls by accident, and this one's guard is precisely the guard the
-- forward path now bypasses by design — leaving it reachable would mean two
-- answers to "may this game close" with no rule about which wins.
-- -----------------------------------------------------------------------------
drop function if exists public.settle_game(uuid);

-- -----------------------------------------------------------------------------
-- 3. THE BACKFILL — one time, by fiat, in this migration
--
-- EVERY PAST GAME IS MARKED SETTLED AS-IS. The guard is bypassed HERE AND ONLY
-- HERE: this is not the sweep failing to notice unpaid holds, it is the owner
-- declaring the books closed on everything up to today.
--
-- WHAT THIS DOES NOT DO, and each is deliberate:
--   * NO attendance is written or rewritten. Unmarked stays unmarked, and the
--     product reads unmarked as attended (the owner's rule) wherever it
--     matters. Marking it here would fabricate a record of who turned up.
--   * NO money moves. No ledger row, no booking status change, no forfeiture.
--   * NO stats change, because nothing downstream distinguishes `played` from
--     `settled` — the roster view, `players_met`, the public profile and
--     `lib/profile/stats.ts` all count both.
--   * The fossil `reserved` holds STAY, as inert rows on settled games. They
--     remain visible as money owed: the admin's outstanding figure filters on
--     `bookings.status = 'reserved'` and excludes only CANCELLED games, so
--     settling does not hide a single crown of it.
--
-- `cancelled` IS EXCLUDED. A cancelled game is already terminal and settling
-- it would overwrite a decision somebody made.
-- -----------------------------------------------------------------------------
do $$
declare
  v_count   integer;
  v_events  integer;
begin
  with promoted as (
    update public.games g
       set status = 'settled'
     where g.starts_at < now()
       and g.status not in ('settled', 'cancelled', 'draft')
    returning g.id, g.city, g.brand
  ), logged as (
    insert into public.events (event_type, game_id, metadata, city, brand)
    select 'game_settled', p.id,
           jsonb_build_object('rail', 'backfill', 'basis', 'round 29 fiat'),
           p.city, p.brand
      from promoted p
    returning 1
  )
  select (select count(*) from promoted), (select count(*) from logged)
    into v_count, v_events;

  raise notice 'round 29 backfill: % past games marked settled by fiat (% events)',
    v_count, v_events;
end $$;

-- -----------------------------------------------------------------------------
-- 4. The capability flag
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
    'autoSettle',             true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
do $$
declare
  v_caps    jsonb;
  v_venue   uuid;
  v_game    uuid;
  v_held    uuid;
  v_player  uuid;
  v_out     jsonb;
  v_ledger  integer;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'autoSettle')::boolean, false) is not true then
    raise exception 'auto-settle: the capability flag did not turn on';
  end if;

  -- Manual settling must be GONE, not merely unused.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'settle_game') then
    raise exception 'auto-settle: settle_game is still callable';
  end if;

  -- THE BACKFILL LEFT NOTHING BEHIND.
  if exists (select 1 from public.games
              where starts_at < now() and status not in ('settled', 'cancelled', 'draft')) then
    raise exception 'auto-settle: a past game survived the backfill';
  end if;

  select id into v_player from public.players where auth_user_id is not null order by created_at limit 1;
  if v_player is null then
    raise notice 'auto-settle: no signed-up player — forward sweep NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    insert into public.venues (name) values ('auto settle probe') returning id into v_venue;

    -- A game that kicked off well past the buffer, with a PAID booking on it.
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes)
         values ('auto settle probe', v_venue, now() - interval '6 hours', 10, 150, 'published', 60)
      returning id into v_game;
    insert into public.bookings (game_id, player_id, status, payment_method, price_czk,
                                 credit_applied_czk, guest_count)
         values (v_game, v_player, 'confirmed', 'qr', 150, 0, 0);

    -- A second game past the buffer carrying an UNPAID hold — the tripwire.
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes)
         values ('auto settle probe held', v_venue, now() - interval '6 hours', 10, 150, 'published', 60)
      returning id into v_held;
    insert into public.bookings (game_id, player_id, status, payment_method, price_czk,
                                 credit_applied_czk, guest_count)
         values (v_held, v_player, 'reserved', 'cash', 150, 0, 0);

    select count(*) into v_ledger from public.credit_ledger;

    v_out := public.advance_played_games(120);

    -- ONE SWEEP TOOK THE CLEAN GAME ALL THE WAY.
    if (select status from public.games where id = v_game) <> 'settled' then
      raise exception 'auto-settle: the clean game is % rather than settled',
        (select status from public.games where id = v_game);
    end if;

    -- AND THE TRIPWIRE HELD THE OTHER AT `played`, reporting it.
    if (select status from public.games where id = v_held) <> 'played' then
      raise exception 'auto-settle: the held game is % rather than played',
        (select status from public.games where id = v_held);
    end if;
    if coalesce((v_out ->> 'skipped')::integer, 0) < 1 then
      raise exception 'auto-settle: the skip was not reported (%)', v_out::text;
    end if;
    if not (v_out -> 'skippedGameIds') ? v_held::text then
      raise exception 'auto-settle: the skipped game was not named';
    end if;

    -- NO MONEY MOVED, which the sweep also asserts internally.
    if (select count(*) from public.credit_ledger) <> v_ledger then
      raise exception 'auto-settle: the sweep moved money';
    end if;

    -- ATTENDANCE IS STILL EDITABLE ON A SETTLED GAME (the owner's rule).
    perform public.mark_attendance(
      (select id from public.bookings where game_id = v_game limit 1), 'no_show');
    if (select attendance from public.bookings where game_id = v_game limit 1)
       is distinct from 'no_show' then
      raise exception 'auto-settle: attendance could not be marked after settlement';
    end if;

    raise notice 'auto-settle: verified — one sweep settles, the tripwire skips and names, attendance still edits';
  end;
end $$;
