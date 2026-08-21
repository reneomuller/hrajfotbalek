import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { parsePendingPurchase } from "@/lib/payments/pendingPurchase";
import { forgetPendingPurchase } from "@/lib/payments/pendingPurchaseCookie";
import { readPurchaseStatus } from "@/lib/payments/returnStatus";

export const dynamic = "force-dynamic";

/**
 * `GET /api/payment/status?kind=…&id=…` — what the return page polls
 * (round 15, item 1).
 *
 * A ROUTE HANDLER RATHER THAN A SERVER ACTION, for one reason that decides
 * it: this is a READ, repeated every couple of seconds, and a server action
 * is a POST that Next treats as a mutation — it revalidates the router cache
 * on every call. Thirty of those during one wait would re-render the tree
 * thirty times to answer a question that changes once.
 *
 * IT CANNOT SEE ANYONE ELSE'S PAYMENT. The lookup runs on the caller's own
 * Supabase client, so `bookings_select_own` and `credit_topups_select_own`
 * decide what exists. A guessed id answers `unknown`, which is the same answer
 * a deleted one gives — deliberately, because a distinguishable "not yours"
 * would confirm that the id is real.
 *
 * IT CLEARS THE STASH ON A TERMINAL STATE, which a page cannot do: setting a
 * cookie during a Server Component render is not allowed, and this is the one
 * place in the flow that both learns the answer and may write a header.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    // The page gates on auth already; this is the case where a session
    // expires mid-wait. 401 tells the poller to stop rather than to retry.
    return NextResponse.json({ state: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const purchase = parsePendingPurchase(
    `${url.searchParams.get("kind") ?? ""}:${url.searchParams.get("id") ?? ""}`,
  );

  if (!purchase) {
    return NextResponse.json({ state: "unknown", href: null }, { status: 400 });
  }

  const status = await readPurchaseStatus(purchase);

  if (!status) {
    return NextResponse.json({ state: "unknown", href: null });
  }

  if (status.state !== "pending") await forgetPendingPurchase();

  /*
   * `no-store`, EXPLICITLY. The whole value of this endpoint is that the
   * answer changes underneath it; a cached "pending" served to the poll after
   * the webhook landed is a player left on a spinner for a payment that
   * succeeded.
   */
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
