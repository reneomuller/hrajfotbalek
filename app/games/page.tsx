import type { Metadata } from "next";
import { GameCard } from "@/components/GameCard";
import { NextGameStrip } from "@/components/game/NextGameStrip";
import { getOwnNextBooking } from "@/lib/booking/queries";
import { getSessionUser } from "@/lib/auth/session";
import {
  getVenues,
  listOwnWaitlistGameIds,
  listRostersByGame,
  listUpcomingGames,
} from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: strings.games.listTitle,
  description: strings.meta.description,
};

// Capacity changes as people book, so the list is rendered per request rather
// than statically cached — a cached spots-left count is a wrong one.
export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const games = await listUpcomingGames();
  const gameIds = games.map(({ game }) => game.id);

  // Everything the cards need, resolved in parallel and in bulk. The rosters
  // and venues are one query each for the whole list rather than one per card:
  // a twenty-game list should be a handful of round trips, not sixty.
  const signedIn = (await getSessionUser()) !== null;
  const [rosters, venues, waitlisted, nextOwn, base] = await Promise.all([
    listRostersByGame(gameIds),
    getVenues(games.map(({ game }) => game.venue_id)),
    // Own-row RLS makes both of these empty for a signed-out visitor, which is
    // the right answer — but skipping them entirely saves two round trips on
    // the anonymous path, which is the common one from a shared link.
    signedIn ? listOwnWaitlistGameIds() : Promise.resolve(new Set<string>()),
    signedIn ? getOwnNextBooking() : Promise.resolve(null),
    siteUrl(),
  ]);

  /*
   * "Your next game" needs the live count, which the strip shows; the booking
   * carries a game snapshot but not how full it is now. Reusing the list's
   * count when the game is on the list avoids a second query for a number
   * already in hand.
   */
  const nextOwnCount = nextOwn
    ? (games.find(({ game }) => game.id === nextOwn.game.id)?.bookedCount ?? 0)
    : 0;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {strings.games.listTitle}
      </h1>

      {nextOwn && (
        <div className="mt-6">
          <NextGameStrip game={nextOwn.game} bookedCount={nextOwnCount} />
        </div>
      )}

      {games.length === 0 ? (
        <p className="mt-8 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.games.empty}
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {games.map(({ game, bookedCount }) => (
            <GameCard
              key={game.id}
              game={game}
              bookedCount={bookedCount}
              roster={rosters.get(game.id) ?? []}
              venueRow={game.venue_id ? (venues.get(game.venue_id) ?? null) : null}
              shareUrl={`${base}/game/${game.id}`}
              onWaitlist={waitlisted.has(game.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
