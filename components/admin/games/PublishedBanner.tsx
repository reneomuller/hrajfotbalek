import Link from "next/link";
import { StoryDownloadLink } from "@/components/admin/StoryDownloadLink";
import { strings } from "@/lib/strings";

/**
 * AN UNMISTAKABLE PUBLISHED STATE (round 24, item 5), the sibling of the
 * booking confirmation: the same volt panel, the same tick in a volt disc, the
 * same display face. A player who pays and an organizer who publishes are both
 * being told "the thing you just did worked".
 *
 * NOT A TOAST. A toast is rendered from a client result and can be unmounted
 * by the revalidation that follows the action; this is server-rendered from the
 * `?created=1` the create redirect lands on, so it survives a refresh —
 * `e2e/round24.spec.ts` reloads to prove it.
 */
export function PublishedBanner({ gameId }: { gameId: string }) {
  return (
    <div
      data-testid="game-published"
      className="mt-4 flex flex-wrap items-center gap-3 rounded-card border-2 border-volt bg-volt/[.08] px-5 py-4"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-volt text-[20px] font-bold leading-none text-ink"
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-title uppercase leading-none tracking-wide text-volt">
          {strings.admin.gamePublishedTitle}
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-bone">{strings.admin.gamePublishedBody}</span>
      </span>

      {/* Two ways out — look at what the players will see, or go back — and
          the story to post while the game is fresh. All at the 44px floor. */}
      <span className="flex flex-wrap items-center gap-2">
        <Link
          href={`/game/${gameId}`}
          data-testid="published-view-game"
          className="inline-flex min-h-11 items-center rounded-control bg-volt px-4 text-[13px] font-bold uppercase tracking-wide text-ink no-underline"
        >
          {strings.admin.gamePublishedViewGame}
        </Link>
        <Link
          href="/admin/games"
          data-testid="published-back-to-admin"
          className="inline-flex min-h-11 items-center rounded-control border border-hairline-strong px-4 text-[13px] font-bold uppercase tracking-wide text-bone no-underline"
        >
          {strings.admin.gamePublishedBackToAdmin}
        </Link>
        <StoryDownloadLink gameId={gameId} testId="published-story" emphasis />
      </span>
    </div>
  );
}
