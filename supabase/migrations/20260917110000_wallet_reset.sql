-- =============================================================================
-- ROUND 35 v5, ITEM 2 — every wallet back to zero.
--
-- WHY AGAIN. Round 35 v2 did this two days ago and it was true when it ran.
-- Between then and now the owner exercised the product — two admin grants noted
-- "TEST" and "asdasda", some bookings, some cancellations — leaving 1,620 and
-- 2,520 CZK in two wallets. The pre-launch ruling has not changed: this is test
-- data, and item 2 asks for the reset again rather than assuming the last one
-- still holds.
--
-- SO IT IS A MIGRATION RATHER THAN A STATEMENT SOMEBODY RUNS. A reset that
-- happens twice is a reset that will happen a third time, and a file is the
-- difference between "the wallets are empty" and "somebody emptied them, here,
-- on this date, for this reason".
--
-- THE METHOD, STATED: `delete from public.credit_ledger` — every row, not an
-- offsetting entry per player. The simplest honest way to make a balance zero
-- is for there to be no rows behind it; an offsetting entry would leave a
-- ledger telling a story about money that never moved, and append-only is a
-- property worth having about REAL history, which none of this is.
--
-- `bookings.credit_applied_czk` GOES WITH IT, and it has to: the column is a
-- claim that ledger rows exist, and leaving it set against an empty ledger
-- makes the admin's outstanding figure under-report by exactly the amount it
-- claims was paid. A `reserved` booking therefore owes its full price again,
-- which is the truth once the credit behind it is gone.
--
-- WHAT IS DELIBERATELY NOT TOUCHED: `topups`, for the reason row 296 records —
-- a confirmed top-up row is a record that somebody said money arrived, and
-- inventing a reconciliation rule for it is the ceremony this ruling avoids.
-- It is visible in the admin rather than hidden.
--
-- THIS FILE IS ALL BACKFILL, so its verification asserts the result of its own
-- backfill and nothing else. No fixture is created.
-- =============================================================================

delete from public.credit_ledger;

update public.bookings
   set credit_applied_czk = 0
 where credit_applied_czk <> 0;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.credit_ledger;
  if v_n > 0 then
    raise exception 'wallet reset: % ledger row(s) survived', v_n;
  end if;

  select count(*) into v_n from public.bookings where credit_applied_czk <> 0;
  if v_n > 0 then
    raise exception 'wallet reset: % booking(s) still claim applied credit', v_n;
  end if;

  raise notice 'wallet reset: every balance is zero';
end $$;
