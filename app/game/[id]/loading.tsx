import { ClaimBarSkeleton } from "@/components/game/ClaimBar";
import { getStrings } from "@/lib/i18n/server";

/**
 * The game detail's loading frame (v1.3 §2.10, ruling P).
 *
 * THE ONE SCREEN §3 ASKED FOR A SKELETON ON AND NO FRAME DREW. It is the
 * surface a shared WhatsApp link opens — the most common first contact anyone
 * has with this product — and it is `force-dynamic` with several round trips
 * behind it: the game, the venue, the roster, the waitlist, the organizer and
 * the viewer's own booking. On a phone on mobile data that is long enough to
 * look broken, and "broken" on this screen means the link a friend sent does
 * not work.
 *
 * THE CLAIM BAR IS RENDERED, NOT OMITTED, and that is the part §2.10 is
 * specific about. A skeleton that leaves the bar out reserves none of its
 * height, so the whole page shifts upward the moment the data lands — which is
 * precisely the layout shift a skeleton exists to prevent, arriving from the
 * one element that is always present.
 *
 * Blocks, not a spinner, and no shimmer sweep: the site already has a drifting
 * grain layer behind everything, and two competing motions on a dark background
 * read as a rendering glitch rather than as progress.
 */
function Block({ className }: { className: string }) {
  return <div className={`rounded-control bg-surface-avatar ${className}`} />;
}

export default async function GameDetailLoading() {
  const t = await getStrings();

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-40">
      {/*
        `aria-hidden` on the shapes with a live status beside them (§2.10) —
        a screen reader should hear "Loading games", not eleven grey divs.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {t.common.loading}
      </p>

      <div aria-hidden="true" className="animate-pulse pt-24">
        {/* The venue photo, at the 16:9 the hero reserves for it. */}
        <Block className="aspect-video w-full rounded-card" />

        {/* Venue name. */}
        <Block className="mt-4 h-7 w-2/3" />

        {/* The info card: five rows, separated by hairlines rather than gaps,
            so the skeleton has the same rhythm as the thing it stands for. */}
        <div className="mt-4 rounded-card bg-surface p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-4 py-3 ${
                i === 0 ? "" : "border-t border-hairline"
              }`}
            >
              <Block className="h-[15px] w-[92px]" />
              <Block className="h-[15px] w-[112px]" />
            </div>
          ))}
        </div>

        {/* Availability. */}
        <Block className="mt-4 h-[74px] w-full rounded-card" />

        {/* Organizer. */}
        <Block className="mt-4 h-[92px] w-full rounded-card" />

        {/* Lineup — a heading and three rows. */}
        <div className="mt-4 rounded-card bg-surface p-4">
          <Block className="h-[17px] w-[104px]" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="mt-3 flex items-center gap-3">
              <Block className="h-[34px] w-[34px] rounded-full" />
              <Block className="h-[15px] w-1/2" />
            </div>
          ))}
        </div>
      </div>

      <ClaimBarSkeleton />
    </main>
  );
}
