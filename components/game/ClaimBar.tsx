import Link from "next/link";
import { CancelBookingForm } from "@/components/CancelBookingForm";
import { WaitlistButton } from "@/components/WaitlistButton";
import { formatCzk, formatTime } from "@/lib/format";
import { claimBarState, type ClaimBarFacts } from "@/lib/games/claimBar";
import { getStrings } from "@/lib/i18n/server";

/**
 * The claim bar (v1.3 §2.4, ruling G).
 *
 * PRESENT ON EVERY GAME DETAIL, IN EVERY STATE — which is the change. The bar
 * it replaces rendered only under `canAct && !holdsSpot && !isFull`, so five of
 * the seven states were the absence of the control: a holder, a waiting player,
 * a full game, a started game and a cancelled game each got a page whose bottom
 * edge was simply empty, and the reader had to scroll the body to find out
 * where they stood. The brief's bug 1 ("the bar is transparent") was the
 * visible half of a bar that was also frequently missing.
 *
 * NEVER TRANSPARENT. `bg-surface` at full opacity, not `bg-ink/95` with a
 * backdrop blur — a translucent bar over a dark photo is unreadable exactly
 * when it matters, and a blur is a rendering cost on the one element that must
 * never stutter while the page scrolls under it.
 *
 * WHICH STATE IS DECIDED IN `lib/games/claimBar.ts`, not here, because the
 * thing that goes wrong is precedence and precedence is invisible in JSX. This
 * component renders a decided state and makes no decisions of its own beyond
 * formatting.
 *
 * THE HEIGHT IS RESERVED BY THE SKELETON (§2.10). `ClaimBarSkeleton` below is
 * the same shell at the same height, so the page beneath does not jump when the
 * data lands.
 *
 * WAITLIST: NO `LEAVE` CONTROL, AND THAT IS A KNOWN GAP. There is no
 * `leave_waitlist` RPC — `join_waitlist`, `waitlist_position` and
 * `notify_waitlist` are the only three — and every transition here is a
 * `SECURITY DEFINER` RPC, so it cannot be faked from the client. Leaving is
 * quarantined. The right-hand space is deliberately laid out to hold a control
 * so that adding one later is not a re-layout.
 */

/**
 * The shell, shared by the bar and its skeleton so the two cannot drift apart.
 *
 * `bottom: var(--tabbar-h)` puts it ABOVE the nav pill rather than behind it —
 * that custom property is the pill's whole footprint including the iPhone home
 * indicator, and it resolves to 0 at `md` where the pill is not rendered. Two
 * hard-coded 64s here and in `globals.css` is how a button ends up half-covered
 * on one route.
 *
 * `rounded-t-card` — the top corners only. It is the bottom edge of the
 * viewport; rounding the bottom corners would float it over a strip of page
 * that has nothing to do with it.
 */
const SHELL =
  "fixed inset-x-0 z-30 rounded-t-card bg-surface shadow-lift";

/** Height floor, so the seven states are one bar rather than seven heights. */
const INNER = "mx-auto flex w-full max-w-shell items-center gap-4 px-gutter py-3";

export async function ClaimBar({
  gameId,
  bookingId,
  priceCzk,
  startsAt,
  facts,
}: {
  gameId: string;
  /** The viewer's own booking, when they hold one — needed by cancel. */
  bookingId: string | null;
  priceCzk: number;
  startsAt: string;
  facts: ClaimBarFacts;
}) {
  const t = await getStrings();
  const state = claimBarState(facts);

  /*
   * The left-hand side is the PRICE in five of the seven states, and the
   * player's own money in the other two. It never truncates (§2.13).
   */
  const price = (
    <span data-testid="claim-bar-price" className="shrink-0 text-body-lg font-bold text-bone">
      {formatCzk(priceCzk)}
    </span>
  );

  /** A sentence where a button would be — the three no-button states. */
  const note = (testId: string, text: string, tone: string) => (
    <span data-testid={testId} className={`ml-auto text-right text-small ${tone}`}>
      {text}
    </span>
  );

  let left = price;
  let right: React.ReactNode;

  switch (state.kind) {
    case "cancelled":
      right = note("claim-bar-cancelled", t.booking.barCancelled, "text-faint");
      break;

    case "started":
      right = note(
        "claim-bar-started",
        t.booking.barKickedOffAt.replace("{time}", formatTime(startsAt)),
        "text-faint",
      );
      break;

    case "holding-paid":
      // The player's own state replaces the price: what this game costs stopped
      // being the question the moment they paid it.
      left = (
        <span data-testid="claim-bar-paid" className="shrink-0 text-body-lg font-bold text-volt">
          {t.booking.barPaid}
        </span>
      );
      right = state.canCancel ? (
        <CancelBookingForm
          bookingId={bookingId ?? ""}
          variant="bar"
          toastTo={`/game/${gameId}`}
        />
      ) : undefined;
      break;

    case "holding-unpaid":
      left = (
        <span data-testid="claim-bar-due" className="shrink-0 text-body-lg font-bold text-warn">
          {t.booking.barAmountDue.replace("{amount}", formatCzk(state.amountDueCzk))}
        </span>
      );
      right = state.canCancel ? (
        <CancelBookingForm
          bookingId={bookingId ?? ""}
          variant="bar"
          toastTo={`/game/${gameId}`}
        />
      ) : undefined;
      break;

    case "waitlisted":
      right = note(
        "claim-bar-waitlisted",
        state.position === null
          ? t.booking.barOnWaitlistNoPosition
          : t.booking.barOnWaitlist.replace("{n}", String(state.position)),
        "text-muted",
      );
      break;

    case "full":
      /*
       * SECONDARY, not primary (§2.5): joining a queue is not the same
       * commitment as taking a spot, and drawing it in volt would say it was.
       *
       * A FORM, not a link — unlike the claim, which navigates to `/book`,
       * joining is a single `join_waitlist` call with nothing to choose on the
       * way. There is no `/game/[id]/waitlist` page and there should not be
       * one: a route whose only content is a button is a tap spent on
       * navigation.
       */
      right = (
        <div className="ml-auto shrink-0">
          <WaitlistButton gameId={gameId} alreadyOnList={false} position={null} variant="bar" />
        </div>
      );
      break;

    case "open-signed-in":
    case "open-signed-out":
      right = (
        <Link
          href={`/game/${gameId}/book`}
          data-testid="book-cta"
          className="ml-auto flex min-h-[52px] shrink-0 items-center justify-center rounded-control bg-volt px-5 text-body-lg font-bold text-ink no-underline transition-colors hover:bg-volt-dim"
        >
          {state.kind === "open-signed-in"
            ? t.booking.claimSpot
            : t.booking.signInToClaim}
        </Link>
      );
      break;
  }

  return (
    <footer
      data-testid="claim-bar"
      data-state={state.kind}
      aria-label={t.booking.barLabel}
      className={SHELL}
      style={{ bottom: "var(--tabbar-h)" }}
    >
      <div className={INNER}>
        {left}
        {right}
      </div>
    </footer>
  );
}

/**
 * The bar's footprint while the detail loads (§2.10).
 *
 * Rendered in its own state rather than omitted, so its height is reserved and
 * the content beneath does not jump when the data lands. §2.10 calls this out
 * specifically for the game detail: it is the surface a shared WhatsApp link
 * opens, and it was the one screen §3 asked for a skeleton on that no frame
 * drew.
 */
export function ClaimBarSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="claim-bar-skeleton"
      className={SHELL}
      style={{ bottom: "var(--tabbar-h)" }}
    >
      <div className={`${INNER} animate-pulse`}>
        <div className="h-[22px] w-[72px] rounded-pill bg-surface-avatar" />
        <div className="ml-auto h-[52px] w-[148px] rounded-control bg-surface-avatar" />
      </div>
    </div>
  );
}
