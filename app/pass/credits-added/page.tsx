import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnCreditBalance } from "@/lib/booking/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { creditsLabel } from "@/lib/pass/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.pass.creditsAddedTitle, robots: { index: false, follow: false } };
}

/**
 * `/pass/credits-added` — the pass half of the booking-confirmed screen
 * (round 15, item 2).
 *
 * THE SIBLING, AND DELIBERATELY THE SAME ANATOMY: a volt panel with a mark
 * and the display face, one fact underneath, one action. The booking screen
 * is what a player who paid for a game sees; this is what a player who paid
 * for credit sees, and they should recognise the second from the first.
 *
 * THE COUNT IS READ FROM THE LEDGER, NEVER FROM THE PURCHASE. It would have
 * been easy to render "you bought 5 credits" off the top-up row, and it would
 * have been the wrong number the first time somebody bought a pass while
 * holding a balance. "You now have N" is the number they will see on the next
 * screen, and it comes from the same place that screen reads — `SUM(delta_czk)`
 * over their own rows, which is the authority.
 *
 * `?topup=` IS NOT READ, AND THAT IS ON PURPOSE. The return page passes it so
 * the URL says what happened, and a later receipt view has a row to open. But
 * nothing here depends on it, so this page is also the landing for any future
 * in-app credit grant — an admin issuing credit, a cancellation refund — with
 * no purchase to point at. A page that required a purchase id could not do
 * that job.
 *
 * NO CROWNS. The credits ruling puts the wallet in games, and this is the
 * screen that teaches it; a CZK figure here re-introduces the unit at exactly
 * the moment the player is forming their idea of what they just bought.
 */
export default async function CreditsAddedPage() {
  await requireCurrentPlayer("/pass/credits-added");

  const [t, locale, balanceCzk] = await Promise.all([
    getStrings(),
    getLocale(),
    getOwnCreditBalance(),
  ]);

  // Floored, like every other credit count in the product: telling somebody
  // they have five when they can pay for four is a promise the booking path
  // refuses at the moment they are counting on it.
  const credits = Math.floor(Math.max(0, balanceCzk) / PASS_REFERENCE_PRICE_CZK);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div data-testid="credits-added" data-credits={credits}>
        <div className="flex items-center gap-3 rounded-card border-2 border-volt bg-volt/[.08] px-5 py-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-volt text-[20px] font-bold leading-none text-ink"
          >
            ✓
          </span>
          <h1 className="m-0 font-display text-title uppercase leading-none tracking-wide text-volt">
            {t.pass.creditsAddedTitle}
          </h1>
        </div>

        <p
          data-testid="credits-added-count"
          className="mt-6 mb-0 text-body-lg font-semibold text-bone"
        >
          {t.pass.creditsAddedCount.replace("{credits}", creditsLabel(credits, locale, t))}
        </p>

        <p className="mt-2 mb-0 text-body text-muted">{t.pass.creditEqualsGame}</p>

        {/*
          ONE ACTION, and it is the one the owner named. Credits are only
          worth anything spent on a game, so the screen points at the list of
          them — not back at the pass page, which would invite buying a
          second pass on the strength of having bought the first.
        */}
        <Link
          href="/games"
          data-testid="credits-added-back"
          className="mt-8 block rounded-control bg-volt px-6 py-4 text-center text-cta font-extrabold uppercase tracking-wide text-ink no-underline transition-colors hover:bg-volt-dim"
        >
          {t.pass.creditsAddedBack}
        </Link>
      </div>
    </main>
  );
}
