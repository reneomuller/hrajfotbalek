/**
 * What the player was paying for, remembered across the trip to Stripe
 * (round 15, item 1).
 *
 * THE PROBLEM. A Payment Link is a page on `stripe.com`. The player leaves,
 * pays, and comes back to a URL WE configured on the link — one URL, the same
 * for every payment, carrying nothing about which booking or which pass tier
 * was just bought. Meanwhile the webhook is arriving on the server, and the
 * two race. So the return page has to answer "what am I waiting for?" before
 * it can answer "did it work?".
 *
 * A COOKIE, NOT `sessionStorage`, AND THE REASON IS NOT PREFERENCE. The id
 * does not exist in the browser at any point. It is created inside a server
 * action — `create_booking` or `begin_pass_purchase` — and the same action
 * redirects to Stripe without ever returning to the client. There is no
 * moment in which client code holds the id to stash it. The cookie is written
 * on the server in the same request that mints the id, which also makes it
 * impossible to miss: there is no "the JS did not run" case.
 *
 * `sameSite: "lax"` IS LOAD-BEARING AND MUST NOT BE TIGHTENED. The return is a
 * top-level navigation from `stripe.com` to this site — cross-site. A
 * `strict` cookie is withheld on exactly that navigation, so the return page
 * would find nothing and fall through to the recovery lookup on every single
 * payment. `lax` sends it on top-level GET navigations, which is this and
 * nothing else.
 *
 * THIS FILE IS PURE. Reading and writing the cookie needs `next/headers` and
 * lives in `pendingPurchaseCookie.ts`; the encoding, the parsing and the
 * destinations are here so they can be tested without a request.
 */

/** Namespaced: the cookie jar also holds Supabase's auth cookies. */
export const PENDING_PURCHASE_COOKIE = "hf_pending_purchase";

/**
 * Two hours. Long enough for a player who pays, gets distracted and comes
 * back; short enough that a cookie left over from last week never decides
 * what a return page shows. It is also cleared the moment the poll reaches a
 * terminal state.
 */
export const PENDING_PURCHASE_MAX_AGE_SECONDS = 2 * 60 * 60;

/**
 * The two things this product sells. `pass` rather than `topup` because that
 * is the word the player-facing surface uses; the row it names is a
 * `credit_topups` row, and the mapping is stated once, here.
 */
export type PurchaseKind = "booking" | "pass";

export interface PendingPurchase {
  kind: PurchaseKind;
  id: string;
}

/** `booking:<uuid>` — one field, one separator, nothing to escape. */
export function encodePendingPurchase(purchase: PendingPurchase): string {
  return `${purchase.kind}:${purchase.id}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Stripe Checkout Session id: `cs_live_…`, `cs_test_…`.
 *
 * PAY FIRST PUT A NON-UUID IN THIS COOKIE (round 26, item 1). A booking used
 * to exist before the payment, so the stash held a uuid; now the booking is
 * created BY the payment and the only identifier that exists when the form
 * opens is Stripe's session id.
 *
 * THE VALIDATION IS THE POINT OF THE FUNCTION, so it is widened rather than
 * dropped: this value is fed to a database lookup and to a URL builder, and
 * the character class here is exactly what Stripe issues — no slash, no colon,
 * nothing that changes the meaning of either.
 */
const STRIPE_SESSION_RE = /^cs_[A-Za-z0-9_]{8,255}$/;

function isPurchaseKind(value: string): value is PurchaseKind {
  return value === "booking" || value === "pass";
}

/**
 * Parse a stash, or null.
 *
 * IT VALIDATES THE ID SHAPE, which is not ceremony. The value comes back off
 * a cookie; `httpOnly` means a browser will not let a page script edit it,
 * and that is a promise made by the browser rather than by us. Whatever
 * arrives is fed to a database lookup, so it is checked here — a malformed id
 * reaches PostgREST as a failed cast, and a value with a slash in it would
 * reach a URL builder.
 *
 * A BOOKING'S ID MAY BE A STRIPE SESSION SINCE ROUND 26. The uuid form is
 * still accepted for it, because a legacy stash written before that round can
 * still be in somebody's browser.
 */
export function parsePendingPurchase(
  raw: string | undefined | null,
): PendingPurchase | null {
  if (!raw) return null;

  const parts = raw.trim().split(":");
  if (parts.length !== 2) return null;

  const [kind, id] = parts;
  if (!kind || !id) return null;
  if (!isPurchaseKind(kind)) return null;
  /*
   * A PASS is still keyed by our own `credit_topups` uuid — that row exists
   * before the payment and always has. A BOOKING is keyed by the Stripe
   * session, because under pay-first nothing of ours exists yet.
   */
  const looksRight =
    kind === "pass" ? UUID_RE.test(id) : UUID_RE.test(id) || STRIPE_SESSION_RE.test(id);
  if (!looksRight) return null;

  return { kind, id };
}

/**
 * Where a CONFIRMED purchase belongs.
 *
 * BOTH DESTINATIONS ARE PAGES THAT ALREADY EXIST, and the return page sends
 * the player to one rather than rendering a copy of it. A second confirmation
 * screen is a second thing to keep in step with "add to calendar" and with
 * the credits count, and the copy that drifts is always the one nobody is
 * looking at. It also puts the right URL in the address bar, so a refresh, a
 * back button and a shared link all behave.
 */
export function purchaseDestination(
  purchase: PendingPurchase,
  context: { gameId: string | null },
): string | null {
  if (purchase.kind === "pass") return `/pass/credits-added?topup=${purchase.id}`;

  if (!context.gameId) return null;
  return `/game/${context.gameId}/book/confirmation?booking=${purchase.id}`;
}
