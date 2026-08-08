import Link from "next/link";
import { formatCzk } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";

/**
 * The claim button, pinned to the bottom of the viewport (v1.2 §5.6).
 *
 * WHY IT IS STICKY. The game page is now long — hero, info, availability,
 * what's included, organizer, lineup — and the button used to sit in the middle
 * of it, wherever the flow happened to put it. A player who scrolled down to
 * read the lineup had to scroll back up to act, and the most common outcome of
 * scrolling back up is not acting. The decision has to be reachable from
 * wherever the reader forms it.
 *
 * THE PRICE IS ON THE BUTTON, and this is where the price went when it came off
 * the list rows. On a row it was noise — identical across every game, opposite
 * the venue name where the eye lands. Here it is the last thing read before a
 * commitment, which is the one moment it is worth reading. "Join game · 200
 * CZK" is also the complete sentence: nobody has to hunt for what it costs.
 *
 * SAFE-AREA INSET, because this sits exactly where an iPhone's home indicator
 * does. `env(safe-area-inset-bottom)` is added to the padding rather than
 * substituted for it, so a device without one still gets its 12px.
 *
 * IT DOES NOT BOOK. It links to `/game/[id]/book`, the same as the inline CTA
 * it replaces — §5.6a's one-claim-button rule is about there being ONE, not
 * about where it is. The write is gated in `createBookingAction`, not here: an
 * anonymous visitor may walk the whole flow and authenticate at the end, which
 * is the no-pre-auth-hold rule.
 */
export async function StickyCta({
  gameId,
  priceCzk,
  signedIn,
}: {
  gameId: string;
  priceCzk: number;
  signedIn: boolean;
}) {
  const t = await getStrings();

  return (
    <div
      data-testid="sticky-cta"
      /*
        `fixed`, not `sticky`. A sticky element is bounded by its scroll
        container, so it stops being pinned as soon as the page's last section
        scrolls past — which on this page is the lineup, the part people read
        longest. Fixed is unconditional.

        The gradient above the bar is what stops content appearing to end
        abruptly under a hard edge.
      */
      className="fixed inset-x-0 z-30 border-t border-hairline-volt bg-ink/95 pb-3 backdrop-blur-sm"
      /*
        ABOVE THE TAB BAR, not behind it. `--tabbar-h` is the bar's footprint
        including the iPhone home indicator, and 0 at `md` where the bar is not
        rendered — so this sits on the viewport floor on a desktop and on top
        of the bar on a phone, from one number. Two hard-coded 64s here and in
        globals.css is how the button ends up half-covered on one route.

        The bar owns the safe-area inset on a phone, which is why the padding
        here is a flat 12px: adding the inset again would double it.
      */
      style={{ bottom: "var(--tabbar-h)" }}
    >
      <div className="mx-auto w-full max-w-shell px-gutter pt-3">
        <Link
          href={`/game/${gameId}/book`}
          data-testid="book-cta"
          className="flex min-h-[52px] items-center justify-center rounded-control bg-volt px-6 text-cta font-extrabold uppercase tracking-wide text-surface no-underline transition active:scale-[.985]"
        >
          {`${signedIn ? t.booking.claimSpot : t.booking.logInToClaim} · ${formatCzk(
            priceCzk,
          )}`}
        </Link>

        {/* The pass, beneath. Someone about to pay full price for one game is
            exactly the person for whom pre-buying is worth anything — the same
            reasoning that puts the pass panel on the games list. */}
        <Link
          href="/pass"
          data-testid="sticky-pass-link"
          className="mt-2 block text-center text-[11px] uppercase tracking-eyebrow text-volt-dim no-underline"
        >
          {t.pass.tryThePass}
        </Link>
      </div>
    </div>
  );
}
