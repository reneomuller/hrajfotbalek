-- =============================================================================
-- Round 16 item 6 — POLICY v3: the refund cutoff moves from 10 hours to 8
--
-- WHAT CHANGES. `cancel_booking` refuses credit inside 8 hours of kickoff
-- instead of 10. Cancelling ITSELF is untouched and stays open until kickoff:
-- a player who cannot come must always be able to free the spot, because a
-- rule that punishes them for saying so produces no-shows instead, which is
-- worse for everyone still hoping to play.
--
-- THE VERSION STAMP MOVES WITH THE RULE. `events.policy_version` and
-- `credit_topups.policy_version` default to 'v3' from here, so a row written
-- after this migration is answerable under the rule actually in force when it
-- was written. Rows already stamped 'v2' keep it — that is what stamping is
-- for.
--
-- -----------------------------------------------------------------------------
-- THE SECOND HALF IS THE INTERESTING ONE: the number becomes READABLE.
--
-- Until now this constant lived in two hand-kept places — here and in
-- `lib/policy.ts` — and the v2 migration's own comment admitted the failure
-- mode out loud: "if the two disagree, the database is right and the UI is
-- lying." They disagree exactly once per policy change: in the window between
-- the migration landing and the deploy that matches it. During that window the
-- product PROMISES A REFUND IT WILL NOT PAY.
--
-- That window is not hypothetical tonight — the code ships hours before the
-- owner can apply this.
--
-- `cancellation_refund_cutoff_hours()` closes it. The application asks the
-- database what the enforced cutoff is and renders THAT, falling back to
-- `lib/policy.ts` only when the function does not exist — which is exactly the
-- pre-v3 world, where the fallback is the correct answer:
--
--   before this migration: function absent  -> UI says 10, SQL enforces 10
--   after  this migration: function says 8  -> UI says 8,  SQL enforces 8
--
-- There is no third state. The contradiction becomes structurally impossible
-- rather than avoided by careful sequencing, which is what "verify before each
-- deploy" is trying to buy and cannot actually guarantee.
--
-- Rollback: supabase/rollback/20260823110000_policy_v3_eight_hours_down.sql
-- =============================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.cancel_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  /*
   * THE CUTOFF. EIGHT HOURS SINCE POLICY v3.
   *
   * ~~Restated from `lib/policy.ts`, which SQL cannot read — so this is the
   * one policy window that exists in two places, and if they disagree the
   * database is right and the UI is lying.~~
   *
   * THE "IF THEY DISAGREE" WAS THE PROBLEM, and v3 removes it rather than
   * restating it. Two hand-kept copies of a money rule disagree exactly once
   * — in the window between a migration and the deploy that matches it — and
   * during that window the UI promises a refund the database refuses.
   * `cancellation_refund_cutoff_hours()` below reads THIS constant out to the
   * application, and `lib/policy.ts` keeps its number only as the fallback
   * for a database where that function does not exist yet.
   *
   * This is still the authority: a route guard is skipped by anyone using
   * curl, and nothing here depends on the caller having read the number.
   */
  v_cutoff_hours constant numeric := 8;

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
  'Cancels a booking the caller owns. REFUND is gated at 8 hours before '
  'starts_at (policy v3). At or beyond the cutoff the value returns as credit; '
  'inside it the spot is released and nothing is credited, with forfeited_czk '
  'recorded on the booking_cancelled event.';

-- -----------------------------------------------------------------------------
-- The number, readable by the application
--
-- STABLE RATHER THAN IMMUTABLE, and not for pedantry: a later policy could
-- make this depend on a row, and a function marked IMMUTABLE that reads one is
-- a planner bug waiting for its first cached plan. STABLE costs nothing here.
--
-- SECURITY INVOKER, granted to `anon` as well: the cutoff is on the public FAQ
-- and on a game page a signed-out visitor can read. It discloses a published
-- policy, not a fact about anybody.
-- -----------------------------------------------------------------------------
create or replace function public.cancellation_refund_cutoff_hours()
returns integer
language sql
stable
security invoker
set search_path = ''
as $fn$ select 8 $fn$;

comment on function public.cancellation_refund_cutoff_hours() is
  'The enforced refund cutoff in hours, so the UI cannot contradict '
  'cancel_booking. Changed in the same migration as v_cutoff_hours inside '
  'cancel_booking, and the two are asserted equal at migration time.';

revoke execute on function public.cancellation_refund_cutoff_hours() from public;
grant execute on function public.cancellation_refund_cutoff_hours()
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The stamp moves with the rule
-- -----------------------------------------------------------------------------
alter table public.events         alter column policy_version set default 'v3';
alter table public.credit_topups  alter column policy_version set default 'v3';

-- -----------------------------------------------------------------------------
-- Verification — same transaction as the migration.
--
-- IT COMPARES THE TWO NUMBERS rather than checking either one, because the
-- failure this migration exists to prevent is precisely their disagreement.
-- Reading `v_cutoff_hours` back out of `prosrc` is crude, and that is the
-- point: it is the only way to assert that the constant a human edited and the
-- constant the function reports are the same constant.
-- -----------------------------------------------------------------------------
do $ver$
declare
  v_reported  integer;
  v_in_source text;
begin
  select public.cancellation_refund_cutoff_hours() into v_reported;

  select substring(p.prosrc from 'v_cutoff_hours constant numeric := ([0-9]+)')
    into v_in_source
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_booking';

  if v_in_source is null then
    raise exception 'could not read v_cutoff_hours out of cancel_booking';
  end if;

  if v_reported <> v_in_source::integer then
    raise exception 'the reported cutoff (%) and the enforced cutoff (%) disagree',
      v_reported, v_in_source;
  end if;

  if v_reported <> 8 then
    raise exception 'policy v3 is 8 hours, found %', v_reported;
  end if;

  if (select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'events'
          and column_name = 'policy_version') not like '%v3%' then
    raise exception 'events.policy_version still defaults to the old version';
  end if;

  raise notice 'policy v3 verified: cutoff % hours, reported and enforced agree', v_reported;
end
$ver$;
