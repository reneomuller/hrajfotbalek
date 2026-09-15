/**
 * What one credit is worth, in crowns.
 *
 * A LEAF MODULE ON PURPOSE (round 16, item 20). This constant lived in
 * `lib/pass/queries.ts`, which opens a server Supabase client and therefore
 * imports `next/headers`. Importing the number from a CLIENT component — the
 * admin game form, which prefills a price with it — dragged that whole chain
 * across the boundary and broke the page at runtime with "you're importing a
 * module that depends on next/headers".
 *
 * NOTHING IN THE TYPES SAID SO. `tsc`, `eslint` and `next build` were all
 * clean; the failure appeared in a browser console during the e2e run. A pure
 * constant sitting in a module that talks to a database is a client-boundary
 * landmine, and the fix is that the constant does not live there.
 *
 * THE VALUE IS THE CREDITS RULING: one credit is one game at 180 CZK, and the
 * whole product divides balances by it. `lib/pass/queries.ts` re-exports it so
 * existing callers are unchanged.
 *
 * ~~150.~~ 180 SINCE ROUND 35 v2, and it moved with
 * `public.credit_seat_price_czk()` in the same round. **SQL IS THE AUTHORITY**
 * — a route guard is skipped by anyone using curl, and every debit is decided
 * inside `create_booking_internal`. This is the display mirror, and the two
 * must move together.
 *
 * THE AUDIT THAT ROUND FOUND TWO OTHER COPIES, both now gone: `TOPUP_PRESETS`
 * in `lib/payments/topup.ts`, which was `[150, 300, 450]` and unused, and
 * `pass_tiers_credited_rule`, a CHECK constraint that spelled 150 as a literal
 * and now calls the function. A price in four places is a price that will
 * disagree with itself.
 */
export const PASS_REFERENCE_PRICE_CZK = 180;
