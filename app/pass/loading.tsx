import { getStrings } from "@/lib/i18n/server";

/**
 * Route-level loading UI for `/pass` (round 37, item 3).
 *
 * MEASURED, AND IT WAS THE WORST TAP LEFT. A live A/B on production, both
 * destinations `force-dynamic` and both reached by a `<Link>` from `/games`:
 * `/`, which has a boundary, painted **55ms** after the tap; `/pass`, which had
 * none, painted **828ms** after it. Fifteen times the wait, with the previous
 * page sitting on screen throughout, because `<Link>`'s automatic prefetch on a
 * dynamic route caches only as far as a loading boundary and there was nothing
 * here to cache.
 *
 * SHAPES AT THE TIERS' OWN HEIGHT. The pass table is five rows; a spinner
 * replaced by five rows moves everything under it, including the row somebody
 * was already reaching for.
 *
 * NO REAL COPY IN HERE. `/pass` carries the credit vocabulary the round-34 law
 * governs and the `credit-equivalence` marker specs assert on — repeating
 * either would make this file indistinguishable from the page for a test, which
 * is the Suspense-fallback trap CLAUDE.md records and which `app/loading.tsx`
 * walked into earlier this round.
 */
export default async function Loading() {
  const t = await getStrings();
  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-32 pt-24">
      <p className="sr-only" role="status">
        {t.common.loading}
      </p>

      {/* The lede block above the table. */}
      <div className="h-10 w-3/5 animate-pulse rounded-card bg-surface" />
      <div className="mt-3 h-4 w-4/5 animate-pulse rounded-pill bg-surface" />

      {/* Five tiers. */}
      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    </main>
  );
}
