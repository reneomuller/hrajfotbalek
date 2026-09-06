import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmingPayment } from "@/components/payment/ConfirmingPayment";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getStrings } from "@/lib/i18n/server";
import { readPendingPurchase } from "@/lib/payments/pendingPurchaseCookie";
import type { PendingPurchase } from "@/lib/payments/pendingPurchase";
import {
  findRecentPendingPurchase,
  readPurchaseStatus,
  type PurchaseStatus,
} from "@/lib/payments/returnStatus";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.payment.returnTitle,
    // Nobody should arrive here from a search result: it is a step in a
    // payment, meaningless without the session that started it.
    robots: { index: false, follow: false },
  };
}

/**
 * `/payment/return` — where every Stripe Payment Link comes back to
 * (round 15, item 1).
 *
 * ONE URL FOR SIX LINKS, which is why this page has to work out what it is
 * looking at. A Payment Link's redirect is configured on the link, not per
 * payment; it carries nothing about which booking or which tier was bought.
 * Three ways to find out, in order of how much they can be trusted:
 *
 *   0. THE SESSION ID STRIPE PUT IN THE URL (round 27, item 1). `return_url`
 *      carries `{CHECKOUT_SESSION_ID}` and Stripe substitutes it on the
 *      redirect, so for an EMBEDDED checkout the exact identifier arrives
 *      without a cookie, without a database guess, and across any browser.
 *      **It is not trusted because it is in a URL** — `checkout_outcome`
 *      answers no row for a session that is not this player's, so a forged id
 *      reads exactly like a session that does not exist.
 *
 *      It is first because it is the only source that is both exact AND
 *      survives paying on one device and returning on another.
 *
 *   1. THE STASH — a cookie written by the server action that minted the id,
 *      in the same request that built the Stripe URL. Exact, and it cannot be
 *      missed, because there was never a client moment in which to miss it.
 *      **Only the PASS rail writes it now**; the game rail cannot, because
 *      its id is minted during a render. See `payment/checkout/page.tsx`.
 *   2. THE RECOVERY LOOKUP — this player's most recent purchase that actually
 *      went to Stripe, within the hour. For a return in a different browser
 *      or on a different device, where no cookie of ours exists. A guess, and
 *      treated as one.
 *   3. NOTHING — an honest empty state that points at the profile, rather
 *      than a spinner waiting for a payment nobody made.
 *
 * THE SIGNED-OUT CASE IS THE FIRST LINE, and it resumes properly:
 * `requireCurrentPlayer` sends them to `/login?next=/payment/return`, so
 * signing in lands back here and the lookup runs then. It has to be the
 * recovery lookup that finds it in practice — a player who signs in on the
 * device they paid on still has the cookie, and one who does not is exactly
 * case 2.
 *
 * WHY IT REDIRECTS INSTEAD OF RENDERING A CONFIRMATION. The success screens
 * already exist — the booking confirmation with its calendar link, and item
 * 2's credits page. Rendering a copy here would be a second thing to keep in
 * step with both, and it would leave `/payment/return` in the address bar,
 * where a refresh means "look up my last payment again" rather than "show me
 * my booking".
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getStrings();

  await requireCurrentPlayer("/payment/return");

  const query = searchParams ? await searchParams : {};
  const sessionId = typeof query.session_id === "string" ? query.session_id : null;

  /*
   * STRIPE'S OWN ANSWER FIRST. `cs_` is Stripe's prefix for a Checkout
   * Session; anything else in that parameter is somebody typing, and it is
   * cheaper to ignore it than to ask the database about it. The ownership
   * check is still `checkout_outcome`'s — this only avoids a pointless round
   * trip.
   */
  const fromStripe =
    sessionId && sessionId.startsWith("cs_")
      ? ({ kind: "booking", id: sessionId } as const)
      : null;

  /*
   * THE CANDIDATES ARE TRIED IN ORDER AND THE FIRST ONE THE DATABASE
   * RECOGNISES WINS — which is not the same as taking the first that EXISTS,
   * and the difference is the pass rail.
   *
   * BOTH RAILS RETURN THROUGH THIS URL WITH A `session_id`, because both build
   * `return_url` the same way. A pass session is not in the checkout register,
   * so asking `checkout_outcome` about it answers no row — and reading that as
   * "nothing to show" would strand every pass buyer on a spinner. Instead an
   * unrecognised candidate simply loses to the next one, and the pass cookie
   * behind it answers correctly.
   */
  const candidates: PendingPurchase[] = [];
  if (fromStripe) candidates.push(fromStripe);

  const stashed = await readPendingPurchase();
  if (stashed && stashed.id !== fromStripe?.id) candidates.push(stashed);

  let purchase: PendingPurchase | null = null;
  let status: PurchaseStatus | null = null;

  for (const candidate of candidates) {
    const resolved = await readPurchaseStatus(candidate);
    if (resolved) {
      purchase = candidate;
      status = resolved;
      break;
    }
  }

  // The guess, and only once the exact answers have all declined.
  if (!purchase) {
    const recovered = await findRecentPendingPurchase();
    if (recovered) {
      purchase = recovered;
      status = await readPurchaseStatus(recovered);
    }
  }

  if (!purchase) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <section
          data-testid="payment-return-unknown"
          className="rounded-card bg-surface p-6"
        >
          <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {t.payment.returnUnknownTitle}
          </h1>
          <p className="mt-3 mb-0 text-body leading-relaxed text-muted">
            {t.payment.returnUnknownBody}
          </p>
          <Link
            href="/account"
            data-testid="payment-return-profile"
            className="mt-6 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
          >
            {t.nav.profile}
          </Link>
        </section>
      </main>
    );
  }

  /*
   * THE FIRST READ HAPPENS ON THE SERVER, and it is what makes the common
   * case invisible. The webhook usually lands while the player is still
   * looking at Stripe's own "payment received" screen, so by the time this
   * page renders the answer already exists — and rendering "Confirming your
   * payment…" for one frame before jumping is a worse screen than never
   * showing it.
   */
  if (status && status.state !== "pending" && status.href) {
    redirect(status.href);
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <ConfirmingPayment
        purchase={purchase}
        fallbackHref={status?.fallbackHref ?? "/games"}
      />
    </main>
  );
}
