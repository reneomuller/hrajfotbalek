import { getStrings } from "@/lib/i18n/server";

/**
 * The shape of a `GameRow` while the list is loading.
 *
 * `/games` is `force-dynamic` and does several round trips before it can
 * render, which on a phone on mobile data is long enough to look broken. A
 * skeleton in the row's own proportions makes the wait read as loading rather
 * than as an empty list — the failure it prevents is a player closing the tab
 * because "there are no games".
 *
 * THE PROPORTIONS ARE THE WHOLE JOB, and they had drifted. This still drew the
 * v1.1.2 CARD: 20px padding, a 28px title and a row of five avatar circles,
 * about 190px per item. The list has been compact rows since Phase 15, so the
 * real row is roughly half that — the skeleton was reserving twice the space
 * the content needed and the list jumped upward the moment it arrived. A
 * skeleton that does not match is worse than none: it moves the thing the
 * reader is about to tap.
 *
 * Deliberately not animated with a shimmer sweep: the site already has a
 * drifting grain layer behind everything, and two competing motions on a dark
 * background read as a rendering glitch. A slow pulse is enough.
 */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-pill bg-surface-avatar ${className}`} />;
}

export function GameCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-card bg-surface px-4 py-[10px]"
    >
      {/* Time span, and the spots-left count opposite it. */}
      <div className="flex items-center justify-between gap-3">
        <Bar className="h-[13px] w-[92px]" />
        <Bar className="h-4 w-[84px]" />
      </div>

      {/* Venue. */}
      <Bar className="mt-[6px] h-[17px] w-2/3" />

      {/* The segmented capacity bar's footprint, at row scale. */}
      <Bar className="mt-[8px] h-[7px] w-full" />

      {/* The chip line. */}
      <div className="mt-[8px] flex items-center gap-2">
        <Bar className="h-[18px] w-[42px]" />
        <Bar className="h-[18px] w-[56px]" />
      </div>
    </div>
  );
}

/**
 * The list-level skeleton: a heading and five rows.
 *
 * Five because that is what the density criterion (§5.5) puts above the fold on
 * a Pixel 7 — the same number the real list shows, so nothing moves when it
 * arrives.
 */
export async function GamesListSkeleton() {
  const t = await getStrings();
  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {t.games.listTitle}
      </h1>

      <p className="sr-only" role="status">
        {t.common.loading}
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <GameCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
