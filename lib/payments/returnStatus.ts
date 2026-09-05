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

/**
 * PAY FIRST: THE ID IS A STRIPE SESSION, AND THE OUTCOME MAY BE EITHER OF TWO
 * THINGS (round 26, item 1).
 *
 * ~~Read the booking row the checkout created and watch it turn confirmed.~~
 * There is no booking row until the webhook makes one. So this waits for an
 * OUTCOME TO EXIST, and there are two legitimate ones:
 *
 *   BOOKED   — a seat was there. The success screen is the booking's own
 *              confirmation.
 *   CREDITED — the game filled while they were paying. The money is in their
 *              wallet in full, they have been told by notification, and the
 *              right ending is the wallet, not a booking that does not exist.
 *
 * Anything else is still `pending`: the register row exists (we created it
 * when the form opened) and the webhook has not decided yet.
 */
async function readBookingStatus(
  purchase: PendingPurchase,
): Promise<PurchaseStatus | null> {
  const supabase = await createServerSupabaseClient();

  /*
   * THROUGH AN RPC, BECAUSE THE REGISTER IS CLOSED TO CLIENTS. RLS on
   * `checkout_sessions` denies everything and there is no policy to relax —
   * the table names who is trying to buy what.
   */
  const { data, error } = await supabase.rpc("checkout_outcome", {
    p_stripe_session_id: purchase.id,
  });

  // No row means "not yours, or not real" — the same answer, deliberately.
  const rows = (data ?? []) as {
    status: string;
    game_id: string;
    booking_id: string | null;
  }[];
  const outcome = rows[0];
  if (error || !outcome) return null;

  const fallbackHref = `/game/${outcome.game_id}`;

  if (outcome.status === "booked" && outcome.booking_id) {
    return {
      state: "confirmed",
      href: `/game/${outcome.game_id}/book/confirmation?booking=${outcome.booking_id}`,
      fallbackHref,
    };
  }

  /*
   * CREDITED IS AN ENDING, NOT AN ERROR, and it gets its own screen rather
   * than the game page: the player paid, holds the value, and needs to be told
   * where it went. `/account` is the wallet.
   */
  if (outcome.status === "credited") {
    return { state: "elsewhere", href: "/account", fallbackHref };
  }

  /*
   * EXPIRED reaches here when active expiry killed the form before the card
   * was charged — the intended outcome of a game filling, and the one where
   * nothing happened at all. The game page says the game is full, which is the
   * whole story.
   */
  if (outcome.status === "expired") {
    return { state: "elsewhere", href: fallbackHref, fallbackHref };
  }

  return { state: "pending", href: null, fallbackHref };
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
 * IT LOOKS FOR "WENT TO STRIPE", NOT FOR "IS PENDING", and the difference is
 * a bug that only appears when things go RIGHT. `confirm_online_purchase`
 * NULLS `payment_pending_at` when it settles a purchase — so a webhook that
 * lands before the player gets back, which is the normal case, erases the
 * only marker a pending-only search could see. The player would arrive at
 * "nothing to confirm here" moments after a payment that worked perfectly.
 *
 * So the filter is: created within the window, AND either still carrying the
 * pending stamp or already carrying the session that settled it. One of those
 * two is true from the moment the Stripe link is built until long after.
 *
 * `created_at` IS THE RECENCY KEY because it is the one field that survives
 * confirmation unchanged. It is also honest here: both rows are created by
 * the same action that builds the Stripe URL, seconds before the player
 * leaves.
 *
 * IT IS STILL A GUESS AND IS TREATED AS ONE. Only consulted when the precise
 * answer is missing, and only an hour back — a player who paid is returning
 * within seconds, and anything older is somebody else's abandoned checkout
 * being adopted by this one.
 *
 * IT CANNOT LEAK. Both reads are RLS-scoped to the signed-in player, so the
 * worst case is showing them one of their OWN purchases rather than the one
 * they meant, and both destinations are pages they may already visit.
 */
const RECOVERY_WINDOW_MINUTES = 60;

/** Pending, or already settled by Stripe. Either way it went to Stripe. */
const WENT_TO_STRIPE = "payment_pending_at.not.is.null,stripe_session_id.not.is.null";

/*
 * A CANCELLED PURCHASE IS NEVER ADOPTED, and it is the recovery lookup's
 * sharpest edge. Cancelling does not erase `stripe_session_id` or move
 * `created_at`, so a booking somebody cancelled an hour ago still answers
 * "went to Stripe recently" — and it would be adopted ahead of nothing at
 * all, sending a player who made no payment to a game page for a booking they
 * had already given up. The precise path never has this problem, because the
 * cookie names the row; only the guess needs telling what not to guess.
 */
const LIVE_BOOKING_STATUSES = ["reserved", "confirmed"] as const;
const LIVE_TOPUP_STATUSES = ["pending", "confirmed"] as const;

export async function findRecentPendingPurchase(
  now: number = Date.now(),
): Promise<PendingPurchase | null> {
  const supabase = await createServerSupabaseClient();
  const since = new Date(now - RECOVERY_WINDOW_MINUTES * 60 * 1000).toISOString();

  /*
   * THE REGISTER FIRST (round 26, item 1). Under pay-first the thing that
   * exists when somebody returns is a checkout, not a booking — and it exists
   * whether the webhook has landed or not, which is exactly what a return page
   * needs to find.
   *
   * The booking search below stays for legacy rows: a payment started before
   * this round is still in flight for as long as an hour.
   */
  const { data: recentCheckout } = await supabase.rpc("recent_checkout", {
    p_within_minutes: RECOVERY_WINDOW_MINUTES,
  });
  if (typeof recentCheckout === "string" && recentCheckout) {
    return { kind: "booking", id: recentCheckout };
  }

  const [bookings, topups] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, created_at")
      .gte("created_at", since)
      .in("status", LIVE_BOOKING_STATUSES)
      .or(WENT_TO_STRIPE)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("credit_topups")
      .select("id, created_at")
      .gte("created_at", since)
      .in("status", LIVE_TOPUP_STATUSES)
      .or(WENT_TO_STRIPE)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const booking = bookings.data?.[0] ?? null;
  const topup = topups.data?.[0] ?? null;

  if (!booking && !topup) return null;
  if (!topup) return { kind: "booking", id: booking!.id };
  if (!booking) return { kind: "pass", id: topup.id };

  // Both exist: the newer one is the one they just paid for.
  return new Date(topup.created_at).getTime() >
    new Date(booking.created_at).getTime()
    ? { kind: "pass", id: topup.id }
    : { kind: "booking", id: booking.id };
}
