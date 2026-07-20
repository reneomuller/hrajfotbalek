import Link from "next/link";
import { Roster } from "@/components/Roster";
import { SpotsCounter } from "@/components/SpotsCounter";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getGameById, getRoster } from "@/lib/games/queries";
import { strings } from "@/lib/strings";

// The primary surface players land on from a shared WhatsApp link. It must
// render completely for a visitor with no session, so nothing here is gated.
export const dynamic = "force-dynamic";

interface GamePageProps {
  params: Promise<{ id: string }>;
}

export default async function GameDetailPage({ params }: GamePageProps) {
  const { id } = await params;
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

  const { game, bookedCount, spotsLeft, hasStarted, isCancelled } = result;
  const roster = await getRoster(game.id);

  const isFull = spotsLeft === 0;
  // A full game still takes waitlist joins; a started or cancelled one takes
  // nothing. `create_booking` enforces all three — this only mirrors it.
  const canAct = !isCancelled && !hasStarted;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <Link
        href="/games"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      {/* `venue` is admin-supplied free text; JSX text interpolation escapes it. */}
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

      <div className="mt-7">
        <SpotsCounter capacity={game.capacity} bookedCount={bookedCount} />
      </div>

      {isCancelled && (
        <p className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.cancelled}
        </p>
      )}

      {!isCancelled && hasStarted && (
        <p className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.alreadyStarted}
        </p>
      )}

      {canAct && (
        <Link
          href={`/game/${game.id}/book`}
          data-testid="book-cta"
          className="mt-6 block rounded-cta bg-volt px-6 py-4 text-center font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
        >
          {isFull ? strings.games.joinWaitlist : strings.booking.claimSpot}
        </Link>
      )}

      <Roster rows={roster} />
    </main>
  );
}
