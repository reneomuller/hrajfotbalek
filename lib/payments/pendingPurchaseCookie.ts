import { cookies } from "next/headers";
import {
  PENDING_PURCHASE_COOKIE,
  PENDING_PURCHASE_MAX_AGE_SECONDS,
  encodePendingPurchase,
  parsePendingPurchase,
  type PendingPurchase,
} from "@/lib/payments/pendingPurchase";

/**
 * The request-scoped half of the pending-purchase stash (round 15, item 1).
 *
 * Split from `pendingPurchase.ts` so the encoding and the validation can be
 * unit-tested without a request; everything here needs `next/headers` and can
 * only run inside one.
 */

/**
 * Remember what is being paid for, immediately before handing the player to
 * Stripe.
 *
 * CALLED FROM A SERVER ACTION, WHICH IS THE ONLY PLACE IT CAN BE. A Server
 * Component may not set a cookie, and the id it stores is minted inside the
 * same action a line earlier. That ordering is the point: the cookie and the
 * `client_reference_id` on the Stripe link are written from one value, so
 * they cannot name different rows.
 */
export async function rememberPendingPurchase(
  purchase: PendingPurchase,
): Promise<void> {
  const store = await cookies();
  store.set(PENDING_PURCHASE_COOKIE, encodePendingPurchase(purchase), {
    httpOnly: true,
    // See `pendingPurchase.ts`: `strict` is withheld on the cross-site
    // top-level navigation back from stripe.com, which is the only navigation
    // this cookie exists for.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_PURCHASE_MAX_AGE_SECONDS,
  });
}

/** What we were waiting for, or null when the cookie is absent or junk. */
export async function readPendingPurchase(): Promise<PendingPurchase | null> {
  const store = await cookies();
  return parsePendingPurchase(store.get(PENDING_PURCHASE_COOKIE)?.value);
}

/**
 * Drop the stash once the purchase has reached a terminal state.
 *
 * ONLY A ROUTE HANDLER OR AN ACTION CAN CALL THIS — same constraint as
 * writing. The return page reaches its terminal states two ways: through the
 * poll route, which calls this, and through its own first read, which
 * `redirect`s from a Server Component and therefore cannot. The leftover in
 * that second case is harmless and self-correcting: it points at a purchase
 * that is already confirmed, so the only thing it can do is send a player who
 * navigates to `/payment/return` by hand to a confirmation page they have
 * already seen. It expires on its own in two hours, and the next purchase
 * overwrites it.
 */
export async function forgetPendingPurchase(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_PURCHASE_COOKIE);
}
