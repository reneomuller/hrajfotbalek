-- =============================================================================
-- Migration 40 — cancel_booking gains a 10-hour refund cutoff (policy v2)
--
-- OWNER'S RULING, 2026-08-19. Cancellation itself is unchanged and stays open
-- right up to kickoff: a player who cannot come should always be able to free
-- the spot, and a rule that punishes them for saying so produces no-shows
-- instead of cancellations. What changes is the REFUND:
--
--     lead >= 10h   full credit, exactly as today
--     lead <  10h   cancellation proceeds, spot released, NO credit
--     after kickoff refused, exactly as today (CANCEL_WINDOW_CLOSED)
--
-- WHAT THIS IS NOT. There is no partial credit, no cash path, and no "unless
-- your spot is filled" clause — that last one is DEFERRED to a future backend
-- round and is on the quarantine list in SCOPE.md. It needs a way to attribute
-- a later booking to the spot this cancellation freed, which nothing in this
-- schema records. The copy must not promise it until it exists.
--
-- BASED ON MIGRATION 33'S BODY, NOT MIGRATION 6'S. `cancel_booking` has been
-- replaced once already: §4.2 made the refund BATCH-AWARE, mirroring each
-- redemption row back to the batch it drew from with that batch's original
-- expiry, because refunding pass credit as never-expiring credit turns a
-- book-and-cancel loop into a way to launder an expiry away. Rebuilding this
-- function from the original would silently revert that. Every line of the
-- refund block below is migration 33's, unchanged; the cutoff wraps it.
--
-- `create or replace` on an IDENTICAL signature: no drop, no new function,
-- nothing for a caller to be pointed at differently.
--
-- POLICY VERSION MOVES TO v2. `events.policy_version` and
-- `credit_topups.policy_version` are column DEFAULTS — nothing writes them
-- explicitly — so bumping the defaults is what stamps new rows. Rows already
-- written keep 'v1', which is the point of the column: it records which policy
-- was in force when the thing happened, and history must not be rewritten.
--
-- `lib/policy.ts` MUST MOVE WITH THIS, and does not move in this file because
-- it cannot: `cutoffHoursBeforeStart` there is what the UI mirrors, and until
-- this migration is applied a UI saying "10 hours" would be describing a rule
-- the database does not enforce. Apply this first, then flip the constant.
-- The two are restated in two languages and MUST change together — the same
-- hazard `LOCAL_HOSTS` carries in `lib/env/testDatabase.ts` and
-- `scripts/apply-migration.mjs`.
--
-- Rollback: supabase/rollback/20260819120000_cancel_cutoff_ten_hours_down.sql
-- =============================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.cancel_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  /*
   * THE CUTOFF, RESTATED FROM `lib/policy.ts`.
   *
   * SQL cannot read a TypeScript module, so this is the one policy window that
   * exists in two places. `policy.cancellation.cutoffHoursBeforeStart` is the
   * other, and it is display only — THIS is the authority, because a route
   * guard is skipped by anyone using curl. If the two disagree, the database
   * is right and the UI is lying.
   */
  v_cutoff_hours constant numeric := 10;

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

  -- UNCHANGED. Cancelling is still permitted right up to kickoff; only the
  -- refund is gated. Freeing the spot late is worth more to everyone else than
  -- the player's silence.
  if v_game.status not in ('published', 'full') or v_game.starts_at <= now() then
    raise exception 'CANCEL_WINDOW_CLOSED'
      using detail = 'game status ' || v_game.status::text || ', starts_at ' || v_game.starts_at::text;
  end if;

  v_lead_hours := round(extract(epoch from (v_game.starts_at - now()))::numeric / 3600.0, 2);

  -- --- credit for money ACTUALLY APPLIED, now gated on lead time -------------
  --
  -- INSIDE the window the calculation is migration 33's, unchanged.
  -- OUTSIDE it, `v_credit` is zero and every downstream branch already handles
  -- that: the refund block is `if v_credit > 0`, no `credit_issued` event is
  -- emitted, and `booking_cancelled` records `credit_issued_czk: 0`. Nothing
  -- needed a second code path.
  if v_lead_hours >= v_cutoff_hours then
    if v_booking.status = 'confirmed' then
      v_credit := v_booking.price_czk;
    else
      v_credit := v_booking.credit_applied_czk;
    end if;
  else
    v_credit := 0;
  end if;

  update public.bookings
     set status = 'cancelled',
         cancel_lead_hours = v_lead_hours
   where id = p_booking_id;

  if v_credit > 0 then
    -- Mirror every redemption this booking wrote, back to the batch it drew
    -- from, carrying that batch's original expiry. A spend that crossed two
    -- batches refunds to both, in the amounts it took from each.
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

    -- Whatever is left is credit that came from the ordinary pool, plus the
    -- cash or QR the player actually paid on a confirmed booking. Both are
    -- unexpiring, which is Phase 1 behaviour unchanged.
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

  /*
   * `forfeited_czk` IS NEW ON THIS EVENT, and it is the whole audit trail for
   * a late cancellation. `credit_issued_czk: 0` alone cannot distinguish "an
   * unpaid reservation, which never credited anything" from "a paid spot
   * cancelled two hours before kickoff" — and those are the two cases anyone
   * reading this log later will need to tell apart, most likely while
   * answering a complaint. It is zero whenever the cutoff was met.
   *
   * No new event TYPE, deliberately: `events_event_type_catalog` is a single
   * CHECK that has to be widened in the same migration that emits a new type,
   * and it has been missed once already. A new key on an existing type's
   * metadata needs no catalog change.
   */
  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('booking_cancelled', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object(
            'cancel_lead_hours', v_lead_hours,
            'credit_issued_czk', v_credit,
            'forfeited_czk',
              case
                when v_lead_hours >= v_cutoff_hours then 0
                when v_booking.status = 'confirmed' then v_booking.price_czk
                else v_booking.credit_applied_czk
              end,
            'cutoff_hours', v_cutoff_hours,
            'previous_status', v_booking.status),
          v_game.city, v_game.brand);

  insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
  values ('spot_released', v_booking.player_id, v_booking.game_id, p_booking_id,
          jsonb_build_object('previous_status', v_booking.status),
          v_game.city, v_game.brand);

  perform public.sync_game_fullness(v_booking.game_id);

  return (p_booking_id, 'cancelled'::public.booking_status, v_credit, v_lead_hours)::public.cancel_result;
end $$;

-- `create or replace` preserves privileges. Restated anyway, for the reason
-- migration 39 restates its grants: privileges inherited invisibly are
-- privileges nobody can read off the migration that last touched the function.
revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated, service_role;

comment on function public.cancel_booking(uuid) is
  'Owner-only cancellation, policy v2. Cancelling is permitted until kickoff; '
  'REFUND is gated at 10 hours before starts_at. At or beyond the cutoff, '
  'issues cancellation_credit for money actually applied (QR, cash and credit '
  'alike), refunding pass credit to the batch it came from with that batch''s '
  'expiry. Inside the cutoff the spot is released and no credit is issued; the '
  'booking_cancelled event records forfeited_czk. Money never leaves the '
  'system. Lock order: player, then game.';

-- --- the policy stamp --------------------------------------------------------
--
-- Defaults only. Existing rows keep 'v1' on purpose: the column records which
-- policy was in force when the row was written, and a backfill would erase
-- exactly the fact it exists to preserve.
alter table public.events         alter column policy_version set default 'v2';
alter table public.credit_topups  alter column policy_version set default 'v2';
