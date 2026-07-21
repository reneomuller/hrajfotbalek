import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingError } from "@/components/BookingError";
import { PaymentMethodChoice } from "@/components/PaymentMethodChoice";
import { getSessionUser } from "@/lib/auth/session";
import { readResumeIntent } from "@/lib/booking/resume";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getGameById } from "@/lib/games/queries";
import { strings } from "@/lib/strings";
import { runCreateBooking } from "./actions";

export const dynamic = "force-dynamic";

interface BookPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Booking page.
 *
 * WHERE THE SESSION GATE SITS, AND WHY IT SITS THERE:
 *
 * The gate is on the WRITE, not on the page render. An anonymous visitor may
 * see the QR-vs-cash choice; submitting it sends them to authenticate and the
 * booking is attempted only on the way back, inside `createBookingAction`.
 *
 * That placement is what lets both governing rules hold at once. Hard-gating
 * the page would satisfy "no pre-auth soft hold" — but it also means a player
 * arriving from a Book tap never states a payment preference, so the post-auth
 * resume would have to invent one on their behalf to reach the confirmation.
 * Gating the write keeps the spot uncommitted until an authenticated
 * `create_booking` runs (REQ-SEC-021) while still carrying the player's own
 * choice through the magic-link round trip (REQ-AUTH-004).
 *
 * Nothing on this page reserves anything. The choice is a form value in a URL
 * until the RPC runs.
 */
export default async function BookPage({ params, searchParams }: BookPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const result = await getGameById(id);
  if (!result) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="font-mono text-[12px] tracking-[1px] text-faint">
          {strings.games.notFound}
        </p>
        <Link
          href="/games"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.games.backToGames}
        </Link>
      </main>
    );
  }

  const { game, spotsLeft, hasStarted, isCancelled } = result;

  // The RPC enforces all of this too; the UI only mirrors it. A full game is
  // included: `create_booking` would refuse with CAPACITY_FULL, and until the
  // Phase 17 waitlist exists there is nothing else this page could offer, so
  // sending the player back to the game is more honest than a form that cannot
  // succeed.
  if (isCancelled || hasStarted || spotsLeft === 0) {
    redirect(`/game/${game.id}`);
  }

  // --- post-auth resume ------------------------------------------------------
  // Runs only when the player already stated a method before authenticating.
  // Without one there is nothing to resume automatically, and inventing a
  // payment choice would be worse than showing the two options again.
  const intent = readResumeIntent(query);
  const user = await getSessionUser();

  if (intent?.method && user) {
    const outcome = await runCreateBooking(game.id, intent.method);
    if (typeof outcome === "string") {
      redirect(`/game/${game.id}/book/confirmation?booking=${outcome}`);
    }
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <BookingError code={outcome.code ?? "UNKNOWN"} gameId={game.id} />
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <Link
        href={`/game/${game.id}`}
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.booking.backToGame}
      </Link>

      <h1 className="mt-4 font-display text-section-title uppercase tracking-wide text-white">
        {game.venue}
      </h1>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span className="font-mono text-[13px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </span>
        <span className="font-mono text-[13px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
      </div>

      <div className="mt-8">
        <PaymentMethodChoice gameId={game.id} />
      </div>
    </main>
  );
}
