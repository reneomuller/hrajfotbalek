import { getStrings } from "@/lib/i18n/server";

/**
 * Route-level loading UI for `/` (round 37, item 3).
 *
 * THE HOME TAB IS A THIRD OF THE BOTTOM NAV and had no boundary, so `<Link>`
 * had nothing to prefetch for it — see `app/account/loading.tsx` for the
 * mechanism. This is also the slowest route in the product to render (it reads
 * the next three games, their rosters, their venues and the admin-editable
 * content), which makes it the one where the wait is most worth covering.
 *
 * THE REAL HEADLINE IS NOT REPEATED HERE, and that is a rule rather than a
 * style choice. CLAUDE.md records what happened the last time a skeleton
 * carried real copy: `cutover.spec.ts` asserted on a heading that only
 * `GameCardSkeleton` still rendered, so it passed exactly while the server was
 * slow enough to paint a fallback and failed once it was warm — "a spec that
 * passes on a Suspense fallback is a spec that proves nothing".
 *
 * A first version of this file printed the hero's own two lines, and it
 * reproduced the trap immediately: `home.spec.ts`'s headline measurement found
 * THIS h1 and reported "Play football." wrapping in 0px of available width.
 * The skeleton now draws a BLOCK where the headline goes, so nothing in here
 * can ever be mistaken for the page.
 */
export default async function Loading() {
  const t = await getStrings();
  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-32 pt-24">
      <p className="sr-only" role="status">
        {t.common.loading}
      </p>

      <div className="h-[5.5rem] w-4/5 animate-pulse rounded-card bg-surface" />

      {/* The next three games, at the card's own height so nothing jumps. */}
      <div className="mt-10 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[159px] animate-pulse rounded-card bg-surface" />
        ))}
      </div>

      {/* The three step cards, then the community panel. */}
      <div className="mt-12 grid grid-cols-1 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    </main>
  );
}
