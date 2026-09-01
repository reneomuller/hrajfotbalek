-- =============================================================================
-- Round 24 item 1 — games advance to PLAYED on their own
--
-- WHY THIS EXISTS. Ledger row 165: 28 games on production have kicked off and
-- are still `published`, the oldest on 2026-08-02. `mark_game_played` is
-- reachable only from the admin attendance screen, and nothing calls it on a
-- schedule — so every derived number (`games_played`, hours, venues, every
-- badge, and round 23's "players met") reads ZERO for every player, with the
-- code correct in each case.
--
-- WHAT WAS READ BEFORE THIS WAS WRITTEN, because round 14's lesson is that a
-- state transition is never only a state transition. Every function that moves
-- money or resolves a booking was read end to end. What auto-advancing touches:
--
--   `confirm_booking`  — NO game-status gate; it checks the BOOKING is
--     `reserved` and nothing else. So an admin can still mark a cash booking
--     paid after a game has advanced. THIS IS THE ONE THAT MATTERED: had it
--     been gated on `published`, auto-advance would have stranded every unpaid
--     hold and made `settle_game` permanently impossible, because settling
--     refuses while any `reserved` booking remains.
--
--   `mark_attendance`  — NO game-status gate either, so attendance stays
--     markable and re-markable after the advance. Item 1 requires exactly that
--     and it needs no work: it is already true.
--
--   `cancel_booking`   — already refuses once `starts_at <= now()`, hours
--     before this sweep can fire. A player's refund behaviour is therefore
--     untouched by the advance, because the door it would have closed was
--     closed by the clock first.
--
--   `settle_game`      — requires `played`, which this now produces
--     automatically. It still refuses while unpaid holds remain and still
--     moves no money itself. **Settling stays an explicit admin act**: nothing
--     in this migration calls it, schedules it, or makes it likelier.
--
--   `cancel_game`      — requires `draft`/`published`/`full`, so this is THE
--     ONE BEHAVIOUR THAT CHANGES. Today an admin can bulk-cancel a game that
--     kicked off weeks ago and credit everyone on it; after the advance that
--     door shuts about two hours after kickoff. It is reported rather than
--     worked around: cancelling a game that has already happened is not a
--     thing the product should offer, and the per-player remedy survives —
--     `admin_remove_booking` credits a confirmed booking and has no
--     game-status gate. A later round may widen `cancel_game` to `played` if
--     the owner wants the bulk remedy back; that is a decision, not a bug.
--
-- NOTHING FIRES MONEY ON THE TRANSITION, and this migration does not merely
-- claim that — see the invariant below, which fails the sweep if the ledger or
-- any booking moved while it ran.
--
-- Rollback: supabase/rollback/20260901100000_advance_played_games_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. advance_played_games — the sweep
--
-- IT CALLS `mark_game_played` RATHER THAN UPDATING. One definition of the
-- transition, with its own permission check, its own advisory lock and its own
-- legal-status list. A second `update games set status = 'played'` here would
-- be a copy that drifts, and this repo has paid for that three times.
-- -----------------------------------------------------------------------------
create or replace function public.advance_played_games(p_buffer_minutes integer default 120)
returns integer
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
   * the same game — the second simply sees fewer rows. `mark_game_played`
   * takes its own advisory lock as well, and re-reads the row under it, so a
   * game that changed status between this select and that call is refused
   * there rather than double-advanced.
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
        /*
         * A game that raced to another status is not an error worth failing
         * the sweep over — the same rule the expiry cron follows. Swallowed
         * per game rather than per run, so one bad row cannot strand the rest.
         */
        null;
    end;
  end loop;

  /*
   * THE INVARIANT, AND IT IS THE POINT OF THE ITEM.
   *
   * "No money behaviour auto-fires" is a claim that decays: `mark_game_played`
   * moves no money TODAY, and a later round could add a trigger, an event
   * handler or a line to it without ever reading this file. So the sweep
   * measures rather than trusts — if a single credit_ledger row appeared, or
   * any booking left `reserved`/`confirmed`, the whole transaction is rolled
   * back and the cron reports a failure instead of quietly having paid people.
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
                     || ' while advancing games — the sweep must never settle or refund';
  end if;

  if v_live_after <> v_live_before then
    raise exception 'PLAYED_SWEEP_MOVED_BOOKINGS'
      using detail = 'live bookings changed from ' || v_live_before::text
                     || ' to ' || v_live_after::text
                     || ' while advancing games';
  end if;

  return v_advanced;
end;
$$;

revoke execute on function public.advance_played_games(integer) from public;
grant execute on function public.advance_played_games(integer) to service_role, authenticated;

comment on function public.advance_played_games(integer) is
  'Advances kicked-off games to `played` after duration + a buffer. Calls '
  'mark_game_played so the transition has ONE definition. Refuses to commit if '
  'the credit ledger or any live booking moved while it ran: settling stays an '
  'explicit admin act and this must never become a money path.';

-- -----------------------------------------------------------------------------
-- 2. The capability flag
--
-- Restated in full because `create or replace` needs the whole body, and every
-- existing flag is repeated EXACTLY so applying this cannot switch one off.
-- `playersMet` is included: round 23's migration may or may not have been
-- applied when this one runs, so this restatement must not depend on the order.
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
    'playedSweep',          true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification
--
-- EXERCISED, NOT INSPECTED, and undone by raising inside a block with an
-- `exception` clause — which rolls back everything the block wrote, including
-- anything a trigger wrote in response.
-- -----------------------------------------------------------------------------

do $$
declare
  v_caps    jsonb;
  v_venue   uuid;
  v_old     uuid;
  v_recent  uuid;
  v_count   integer;
  v_status  text;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'playedSweep')::boolean, false) is not true then
    raise exception 'played sweep: the capability flag did not turn on';
  end if;
  if coalesce((v_caps ->> 'gameLanguage')::boolean, false) is not true
     or coalesce((v_caps ->> 'organizerTelegram')::boolean, false) is not true then
    raise exception 'played sweep: restating app_capabilities switched an older flag off';
  end if;

  begin
    /*
     * THE PROBE IMPERSONATES THE CALLER THE SWEEP IS FOR. A migration runs as
     * the table owner, which is neither an admin session nor the service role
     * — so calling the function directly answers INSUFFICIENT_PERMISSION and
     * proves only that the gate exists. `request.jwt.claims` is exactly what
     * `is_service_role()` reads, and `set local` puts it back at the end of
     * the transaction whatever happens.
     */
    set local request.jwt.claims = '{"role":"service_role"}';

    insert into public.venues (name) values ('played sweep probe') returning id into v_venue;

    -- Well past kickoff + duration + buffer.
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes)
         values ('played sweep probe', v_venue, now() - interval '2 days', 12, 150, 'published', 60)
      returning id into v_old;

    -- Kicked off, but still inside duration + buffer. Must NOT advance.
    insert into public.games (venue, venue_id, starts_at, capacity, price_czk, status, duration_minutes)
         values ('played sweep probe', v_venue, now() - interval '30 minutes', 12, 150, 'published', 60)
      returning id into v_recent;

    select public.advance_played_games(120) into v_count;
    if v_count < 1 then
      raise exception 'played sweep: advanced % games, expected at least the stale one', v_count;
    end if;

    select status::text into v_status from public.games where id = v_old;
    if v_status <> 'played' then
      raise exception 'played sweep: the stale game is % rather than played', v_status;
    end if;

    select status::text into v_status from public.games where id = v_recent;
    if v_status <> 'published' then
      raise exception 'played sweep: a game still inside its buffer advanced (%)', v_status;
    end if;

    -- AND IT DID NOT SETTLE. `settle_game` is the next transition and nothing
    -- here may have taken it.
    if exists (select 1 from public.games where id = v_old and status = 'settled') then
      raise exception 'played sweep: a game settled itself';
    end if;

    -- AND THE GATE IS REAL, checked from the other side: without the claim the
    -- same call is refused. Asserted here rather than assumed, because a
    -- SECURITY DEFINER sweep that anyone could call would advance the whole
    -- board on request.
    set local request.jwt.claims = '';
    begin
      perform public.advance_played_games(120);
      raise exception 'played sweep: an unprivileged caller was allowed to advance games';
    exception
      when sqlstate 'P0001' then
        if sqlerrm not like '%INSUFFICIENT_PERMISSION%'
           and sqlerrm not like '%unprivileged caller%' then
          raise;
        end if;
        if sqlerrm like '%unprivileged caller%' then raise; end if;
    end;

    raise exception 'played_sweep_probe_rollback';
  exception
    when others then
      if sqlerrm <> 'played_sweep_probe_rollback' then
        raise;
      end if;
      raise notice 'played sweep: exercised and undone — stale advanced, in-buffer left alone, nothing settled';
  end;
end $$;
