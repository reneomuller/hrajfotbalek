-- =============================================================================
-- Round 13 items 6-8 — the QR era ends; a pass is paid for like a booking
--
-- WHAT THIS CLOSES. Credit was bought by asking for an amount, receiving a
-- bank-QR code with a variable symbol, paying it in a banking app, and waiting
-- for an admin to match the transfer by hand in `/admin/topups`. Every part of
-- that is retired: the QR (item 6), the admin reconciliation surface (item 8),
-- and the rail underneath them (item 7).
--
-- WHAT REPLACES IT is the mechanism round 12 built for bookings. A pass
-- purchase is a `credit_topups` row in `pending`, its id travels to Stripe as
-- `client_reference_id`, and the same signed webhook confirms it. One payment
-- path for the two things this product sells.
--
-- THE TABLE IS NOT REPLACED, DELIBERATELY. `credit_topups` already IS a
-- pending-purchase record with an id, an amount, a tier and a status, and
-- `confirm_topup` already credits through the ledger with the pass-batch
-- expiry rules §4.2 requires. Inventing a second purchase table would mean two
-- places a credit can come from and two sets of expiry arithmetic.
--
-- NOTHING THE LEDGER NEEDS IS DROPPED HERE. `create_topup`, `confirm_topup`,
-- `payment_code` and the whole `credit_ledger` path survive untouched —
-- item 8's deprecation SQL is a SEPARATE file, handed over rather than run,
-- precisely so that a rail with money in it is never dropped by a migration
-- somebody ran without reading.
--
-- Rollback: supabase/rollback/20260821210000_pass_via_stripe_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A top-up can be paid by Stripe, and paid only once
-- -----------------------------------------------------------------------------

alter table public.credit_topups
  add column stripe_session_id        text,
  add column payment_pending_at       timestamptz,
  add column payment_attention_at     timestamptz,
  add column payment_attention_reason text;

-- Idempotency is an index, not a code path — same reasoning as bookings.
create unique index credit_topups_stripe_session_id_key
  on public.credit_topups (stripe_session_id)
  where stripe_session_id is not null;

create index credit_topups_payment_attention_idx
  on public.credit_topups (payment_attention_at)
  where payment_attention_at is not null;

comment on column public.credit_topups.stripe_session_id is
  'The checkout session that paid this purchase. Uniquely indexed: it is what '
  'makes webhook redelivery a no-op.';

-- -----------------------------------------------------------------------------
-- 2. begin_pass_purchase — the row a Stripe link is stamped with
--
-- A thin wrapper over `create_topup` that also starts the online-payment
-- clock. Separate rather than a parameter on `create_topup`, because the two
-- have different callers and different futures: `create_topup` is still the
-- generic "record an intent to add credit" and is what an admin-side grant or
-- a future flow would use.
-- -----------------------------------------------------------------------------

create function public.begin_pass_purchase(p_pass_games integer)
returns public.credit_topups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.credit_topups;
begin
  -- `create_pass_topup` resolves the tier, prices it from `pass_tiers` and
  -- checks the session itself. Doing any of that again here would be a second
  -- opinion about the price, which is the one thing a payment flow must not
  -- have.
  v_row := public.create_pass_topup(p_pass_games);

  update public.credit_topups
     set payment_pending_at = now()
   where id = v_row.id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.begin_pass_purchase(integer) from public;
grant execute on function public.begin_pass_purchase(integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. confirm_online_purchase — ONE entry point for the webhook
--
-- The route holds a reference and an amount and knows nothing else. This
-- decides what the reference IS — a booking or a pass purchase — and hands off
-- to the function that already knows how to settle that kind of thing.
--
-- WHY THE DISPATCH IS HERE AND NOT IN THE ROUTE. Two round trips from a
-- serverless handler ("is it a booking? no? is it a top-up?") is two chances
-- to act on a stale answer, and neither read would be under the lock that the
-- settling function then takes. One call, one transaction.
--
-- Returns 'confirmed' | 'already' | 'attention' | 'unknown', exactly as
-- `confirm_online_payment` does, so the route's mapping is unchanged.
-- -----------------------------------------------------------------------------

create function public.confirm_online_purchase(
  p_reference   uuid,
  p_session_id  text,
  p_amount_czk  integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup  public.credit_topups%rowtype;
  v_reason text;
begin
  if not public.is_service_role() then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'confirm_online_purchase is called by the Stripe webhook only';
  end if;

  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'INVALID_SESSION';
  end if;

  -- A BOOKING FIRST, because that is the commoner reference by far and
  -- `confirm_online_payment` already answers 'unknown' harmlessly when the id
  -- names nothing of its kind.
  if exists (select 1 from public.bookings b where b.id = p_reference) then
    return public.confirm_online_payment(p_reference, p_session_id, p_amount_czk);
  end if;

  select * into v_topup from public.credit_topups t where t.id = p_reference;
  if not found then
    -- Neither. A Payment Link is a public URL and test events carry references
    -- that never existed here; the route logs it and answers 200.
    return 'unknown';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_topup.player_id::text, 0));
  select * into v_topup from public.credit_topups t where t.id = p_reference;

  if v_topup.stripe_session_id is not distinct from p_session_id then
    return 'already';
  end if;

  if v_topup.stripe_session_id is not null then
    v_reason := 'a second checkout session paid a purchase already settled by '
             || v_topup.stripe_session_id;
  end if;

  /*
   * `>=`, NOT `=`, for the same reason bookings use it: the owner may enable
   * adjustable quantity on a link. Anything at or above the tier's price is
   * acceptable and `confirm_topup` credits what actually ARRIVED, so an
   * overpayment becomes credit rather than being lost.
   *
   * NEVER POINT A TIER AT THE SINGLE-GAME LINK. Tier prices are discounted, so
   * a quantity multiple of the single-game price charges the wrong amount —
   * usually MORE than the tier, which this check would happily accept. The
   * guard against that is one link per tier, in the JSON.
   */
  if v_reason is null and p_amount_czk < v_topup.amount_czk then
    v_reason := 'paid ' || p_amount_czk::text || ' CZK against '
             || v_topup.amount_czk::text || ' CZK for this pass';
  end if;

  if v_reason is null and v_topup.status <> 'pending' then
    v_reason := 'purchase status is ' || v_topup.status::text;
  end if;

  if v_reason is not null then
    update public.credit_topups
       set payment_attention_at     = now(),
           payment_attention_reason = v_reason,
           stripe_session_id        = coalesce(stripe_session_id, p_session_id)
     where id = p_reference;

    insert into public.events (event_type, player_id, metadata, city, brand)
    values ('payment_unmatched', v_topup.player_id,
            jsonb_build_object('topup_id', p_reference, 'session_id', p_session_id,
                               'amount_czk', p_amount_czk, 'reason', v_reason),
            v_topup.city, v_topup.brand);

    return 'attention';
  end if;

  update public.credit_topups
     set payment_pending_at = null,
         stripe_session_id  = p_session_id
   where id = p_reference;

  -- The existing ledger path, unchanged: it writes the credit batch with the
  -- pass expiry §4.2 requires and emits `topup_confirmed`.
  perform public.confirm_topup(p_reference, null, p_amount_czk);

  return 'confirmed';
end;
$$;

revoke execute on function public.confirm_online_purchase(uuid, text, integer) from public;
grant execute on function public.confirm_online_purchase(uuid, text, integer) to service_role;

comment on function public.confirm_online_purchase(uuid, text, integer) is
  'The Stripe webhook''s only write. Dispatches a client_reference_id to a '
  'booking or a pass purchase and settles it through that path''s existing '
  'ledger function. Idempotent by stripe_session_id.';

-- -----------------------------------------------------------------------------
-- 4. Verification
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'credit_topups_stripe_session_id_key'
  ) then
    raise exception 'pass via stripe: the idempotency index is missing';
  end if;

  if has_function_privilege('authenticated',
       'public.confirm_online_purchase(uuid, text, integer)', 'EXECUTE') then
    raise exception 'pass via stripe: confirm_online_purchase is callable by authenticated';
  end if;

  -- Nothing the ledger needs may be dropped by this migration.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'confirm_topup') then
    raise exception 'pass via stripe: confirm_topup went missing';
  end if;
end $$;
