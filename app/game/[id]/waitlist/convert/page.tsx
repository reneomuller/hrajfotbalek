import Link from "next/link";
import { WaitlistConvert } from "@/components/WaitlistConvert";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getGameById } from "@/lib/games/queries";
import { isOnWaitlist } from "@/lib/booking/waitlistConvert";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: strings.games.waitlistConvertTitle,
  robots: { index: false, follow: false },
};

/**
 * The landing page for the waitlist spot-open email.
 *
 * Gated on a session because converting writes a booking. The waitlist row
 * itself is read under own-row RLS, so a player who is not on this game's list
 * sees the not-on-the-list state rather than a conversion form that would fail.
 */
export default async function WaitlistConvertPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCurrentPlayer(`/game/${id}/waitlist/convert`);

  const result = await getGameById(id);
  if (!result) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="font-mono text-[12px] tracking-[1px] text-faint">
          {strings.games.notFound}
        </p>
      </main>
    );
  }

  const { game } = result;
  const onList = await isOnWaitlist(game.id);

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
        {onList ? (
          <>
            <p className="mb-6 text-[14px] leading-relaxed text-muted">
              {strings.games.waitlistConvertHint}
            </p>
            <WaitlistConvert gameId={game.id} />
          </>
        ) : (
          <p
            data-testid="not-on-waitlist"
            className="rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
          >
            {strings.games.waitlistNotOnList}
          </p>
        )}
      </div>
    </main>
  );
}
