import { getStrings } from "@/lib/i18n/server";

/**
 * Route-level loading UI for `/account` (round 37, item 3).
 *
 * WHY THIS FILE EXISTS AND NOT JUST FOR TIDINESS. `<Link>`'s automatic prefetch
 * on a DYNAMIC route fetches only as far as the nearest `loading` boundary —
 * with no boundary there is nothing to cache, so the tap is a full server round
 * trip with the OLD page still on screen the whole way. `/games` and
 * `/game/[id]` had one; the account tab, which is a third of the bottom nav,
 * did not.
 *
 * SHAPES, NOT A SPINNER. The panels below are the account page's own blocks at
 * their own sizes, so the layout does not jump when the real thing arrives — a
 * spinner that is replaced by content of a different height moves everything
 * the reader was about to tap.
 *
 * SERVER-RENDERED, so it costs no client JavaScript and appears on the first
 * navigation rather than after hydration.
 */
export default async function Loading() {
  const t = await getStrings();
  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-32 pt-24">
      <p className="sr-only" role="status">
        {t.common.loading}
      </p>

      {/* The identity block: cover band, then the avatar and name row. */}
      <div className="h-[120px] w-full animate-pulse rounded-card bg-surface" />
      <div className="mt-4 flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-pill bg-surface-raised" />
        <div className="flex-1">
          <div className="h-5 w-1/2 animate-pulse rounded-pill bg-surface-raised" />
          <div className="mt-2 h-4 w-1/3 animate-pulse rounded-pill bg-surface" />
        </div>
      </div>

      {/* The stat tiles and the panels under them. */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    </main>
  );
}
