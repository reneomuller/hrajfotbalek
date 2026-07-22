import { strings } from "@/lib/strings";

/**
 * The shape of a `GameCard` while the list is loading.
 *
 * `/games` is `force-dynamic` and does five round trips before it can render,
 * which on a phone on mobile data is long enough to look broken. A skeleton in
 * the card's own proportions makes the wait read as loading rather than as an
 * empty list — the failure it prevents is a player closing the tab because
 * "there are no games".
 *
 * Deliberately not animated with a shimmer sweep: the site already has a
 * drifting grain layer behind everything, and two competing motions on a dark
 * background read as a rendering glitch. A slow pulse is enough.
 */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-chip bg-surface-avatar ${className}`} />;
}

export function GameCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-card border border-hairline bg-surface-card p-5"
    >
      <Bar className="h-3 w-24" />
      <Bar className="mt-4 h-7 w-2/3" />
      <Bar className="mt-3 h-3 w-1/2" />

      {/* The segmented capacity bar's footprint. */}
      <Bar className="mt-6 h-2 w-full" />

      <div className="mt-5 flex items-center gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-8 w-8 rounded-full bg-surface-avatar" />
        ))}
      </div>
    </div>
  );
}

/**
 * The list-level skeleton: a heading and three cards.
 *
 * Three because that is roughly what fits above the fold on a phone — enough
 * to fill the screen, not so many that the real list jumps when it arrives.
 */
export function GamesListSkeleton() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {strings.games.listTitle}
      </h1>

      <p className="sr-only" role="status">
        {strings.common.loading}
      </p>

      <div className="mt-8 flex flex-col gap-5">
        {Array.from({ length: 3 }, (_, i) => (
          <GameCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
