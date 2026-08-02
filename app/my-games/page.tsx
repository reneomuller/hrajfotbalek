import type { Metadata } from "next";
import Link from "next/link";
import { PlayerHistory } from "@/components/account/PlayerHistory";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { splitHistory } from "@/lib/booking/history";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { listOwnBookings } from "@/lib/booking/queries";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.account.myGamesTitle,
    // A player's own fixture list. Never indexed, never previewed.
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * `/my-games` — the player's own fixtures, upcoming and past.
 *
 * EXTRACTED FROM `/account` (v1.2 §7). It was a section three-quarters of the
 * way down a page that also held a photo upload, a wallet, a top-up entry point
 * and three account-security links — so the single most-visited thing a
 * returning player wants ("am I playing this week, and when") was behind a
 * scroll on a page named after administration.
 *
 * The bottom tab bar is what forced the question and answered it: a tab called
 * My games pointing at `/account#somewhere` is a tab that lands you on someone
 * else's business. It is its own route now, and `/account` keeps a link to it
 * so the old path still leads somewhere.
 *
 * Gated server-side by `requireCurrentPlayer`, and gated a second time by RLS:
 * `listOwnBookings` is own-row only, so even a bug in this gate could not
 * surface another player's fixtures.
 */
export default async function MyGamesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getStrings();
  const query = searchParams ? await searchParams : {};

  // The return path is this route, so a player who signs in from here lands
  // back on their fixtures rather than on the account page.
  await requireCurrentPlayer("/my-games");

  const bookings = await listOwnBookings();
  const history = splitHistory(bookings);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {t.account.myGamesTitle}
      </h1>

      {history.upcoming.length === 0 && history.past.length === 0 ? (
        /*
         * The empty state is the FIRST thing a new player sees here, arriving
         * from a tab bar they tapped out of curiosity. It sends them to the
         * board rather than reporting an absence — a page that says "you have
         * no games" and stops is a dead end for exactly the person most likely
         * to be looking for one.
         */
        <div
          data-testid="my-games-empty"
          className="mt-8 rounded-card border border-hairline bg-surface-card p-6"
        >
          <p className="m-0 text-[15px] leading-relaxed text-bone">
            {t.account.myGamesEmpty}
          </p>
          <Link
            href="/games"
            data-testid="my-games-empty-cta"
            className="mt-4 inline-block rounded-cta bg-volt px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-surface no-underline"
          >
            {t.account.myGamesEmptyCta}
          </Link>
        </div>
      ) : (
        <PlayerHistory history={history} />
      )}

      {/* A cancellation made from this page redirects back to it. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
