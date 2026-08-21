-- Rollback for 20260821210000_pass_via_stripe.
--
-- The columns are additive and dropping them loses only the Stripe linkage —
-- but a purchase paid for and not yet credited lives in `credit_topups` with
-- `status = 'pending'`, and dropping `stripe_session_id` takes its idempotency
-- with it. Settle those first:
--   select count(*) from public.credit_topups where status = 'pending';

drop function if exists public.confirm_online_purchase(uuid, text, integer);
drop function if exists public.begin_pass_purchase(integer);

drop index if exists public.credit_topups_payment_attention_idx;
drop index if exists public.credit_topups_stripe_session_id_key;

alter table public.credit_topups
  drop column if exists stripe_session_id,
  drop column if exists payment_pending_at,
  drop column if exists payment_attention_at,
  drop column if exists payment_attention_reason;

-- The webhook route must be pointed back at `confirm_online_payment`, which is
-- untouched by this migration and still handles bookings.
