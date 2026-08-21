import { onlinePaymentState } from "@/lib/booking/queries";
import {
  purchaseDestination,
  type PendingPurchase,
} from "@/lib/payments/pendingPurchase";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Where one purchase stands, read for the Stripe return page (round 15,
 * item 1).
 *
 * THREE STATES, AND THE THIRD IS THE INTERESTING ONE:
 *
 *   `pending`   — the webhook has not landed. Keep waiting; claim nothing.
 *   `confirmed` — it landed and it worked. `href` is the success screen.
 *   `elsewhere` — it is settled, but not into a success screen: money that
 *                 needs attention, a window that expired, a purchase that was
 *                 cancelled. `href` is the surface that ALREADY explains that
 *                 state — the game page's `AwaitingPaymentPanel` for a
 *                 booking, the pass page for a purchase. This page does not
 *                 re-explain them, because a second wording of "money arrived
 *                 and there is no seat" is a second wording to keep true.
 *
 * NOTHING HERE DECIDES ANYTHING. Every state is read back off the row the
 * webhook writes; this file maps a row to a screen. The authority for whether
 * a payment succeeded is `confirm_online_purchase`, under the game's advisory
 * lock, and no amount of polling from a browser changes what it decided.
 *
 * ACCESS CONTROL IS RLS, NOT A FILTER WRITTEN HERE. `bookings_select_own` and
 * `credit_topups_select_own` scope the row set to the caller, so someone
 * else's purchase id returns no row rather than their payment status — which
 * matters more here than usual, because this id travels through a cookie and
 * a query string.
 */
export type PurchaseState = "pending" | "confirmed" | "elsewhere";

export interface PurchaseStatus {
  state: PurchaseState;
  /** Where to send the player. Null only while `pending`. */
  href: string | null;
  /**
   * Where the wait's own way out points — the game page for a booking, the
   * games list for a pass.
   *
   * RESOLVED HERE BECAUSE THE ROW IS ALREADY OPEN. A booking's fallback needs
   * its `game_id`, and asking the client to work that out would mean a second
   * round trip at the moment we have decided to stop waiting. It is always
   * set, including while pending, because the state it serves is the pending
   * one that ran long.
   */
  fallbackHref: string;
}

export async function readPurchaseStatus(
  purchase: PendingPurchase,
): Promise<PurchaseStatus | null> {
  return purchase.kind === "booking"
    ? readBookingStatus(purchase)
    : readPassStatus(purchase);
}

async function readBookingStatus(
  purchase: PendingPurchase,
): Promise<PurchaseStatus | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, game_id, status, payment_pending_at, payment_attention_at")
    .eq("id", purchase.id)
    .maybeSingle();

  // No row means "not yours, or not real" — the same answer, deliberately.
  // Distinguishing them would tell a caller whether a booking id exists.
  if (error || !data) return null;

  const fallbackHref = `/game/${data.game_id}`;

  if (data.status === "confirmed") {
    return {
      state: "confirmed",
      href: purchaseDestination(purchase, { gameId: data.game_id }),
      fallbackHref,
    };
  }

  const online = onlinePaymentState(data);
  if (online === "waiting") return { state: "pending", href: null, fallbackHref };

  /*
   * `none` REACHES HERE TOO, and it is not an error. A booking that is
   * `reserved` with no `payment_pending_at` is one the player is paying for
   * some other way; a `cancelled` one is settled and gone. Both belong on the
   * game page rather than on a spinner that will never stop.
   */
  return { state: "elsewhere", href: fallbackHref, fallbackHref };
}

async function readPassStatus(
  purchase: PendingPurchase,
): Promise<PurchaseStatus | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("credit_topups")
    .select("id, status, payment_attention_at")
    .eq("id", purchase.id)
    .maybeSingle();

  if (error || !data) return null;

  const fallbackHref = "/games";

  if (data.status === "confirmed") {
    return {
      state: "confirmed",
      href: purchaseDestination(purchase, { gameId: null }),
      fallbackHref,
    };
  }

  /*
   * A PASS PURCHASE HAS NO EXPIRY AND MUST NOT PRETEND TO ONE. The thirty
   * minute window exists because an online BOOKING holds seats other people
   * want; a pending top-up holds nothing, so nothing is released when it ages
   * and there is no honest "expired" to report. It stays pending until the
   * webhook settles it or a person cancels it, and the page's own timeout is
   * what stops the player waiting.
   */
  if (data.payment_attention_at || data.status === "cancelled") {
    return { state: "elsewhere", href: "/pass", fallbackHref };
  }

  return { state: "pending", href: null, fallbackHref };
}

/**
 * THE RECOVERY LOOKUP, for a return with no stash: a different browser, a
 * different device, a cookie jar cleared between paying and coming back.
 *
 * "THE MOST RECENT" IS A GUESS AND IS TREATED AS ONE. It is only consulted
 * when the precise answer is missing, it only considers purchases that
 * actually went to Stripe (`payment_pending_at` is stamped by the same action
 * that builds the link), and it only looks back an hour — a player who paid
 * is coming back within seconds, and anything older is somebody else's
 * abandoned checkout being adopted by this one.
 *
 * IT CANNOT LEAK. Both reads are RLS-scoped to the signed-in player, so the
 * worst case is showing them one of their OWN purchases rather than the one
 * they meant, and both destinations are pages they may already visit.
 */
const RECOVERY_WINDOW_MINUTES = 60;

export async function findRecentPendingPurchase(
  now: number = Date.now(),
): Promise<PendingPurchase | null> {
  const supabase = await createServerSupabaseClient();
  const since = new Date(now - RECOVERY_WINDOW_MINUTES * 60 * 1000).toISOString();

  const [bookings, topups] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, payment_pending_at")
      .not("payment_pending_at", "is", null)
      .gte("payment_pending_at", since)
      .order("payment_pending_at", { ascending: false })
      .limit(1),
    supabase
      .from("credit_topups")
      .select("id, payment_pending_at")
      .not("payment_pending_at", "is", null)
      .gte("payment_pending_at", since)
      .order("payment_pending_at", { ascending: false })
      .limit(1),
  ]);

  const booking = bookings.data?.[0] ?? null;
  const topup = topups.data?.[0] ?? null;

  if (!booking && !topup) return null;
  if (!topup) return { kind: "booking", id: booking!.id };
  if (!booking) return { kind: "pass", id: topup.id };

  // Both exist: the newer one is the one they just paid for.
  const bookingAt = new Date(booking.payment_pending_at!).getTime();
  const topupAt = new Date(topup.payment_pending_at!).getTime();
  return topupAt > bookingAt
    ? { kind: "pass", id: topup.id }
    : { kind: "booking", id: booking.id };
}
