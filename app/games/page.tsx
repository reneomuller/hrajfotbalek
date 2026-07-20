import type { Metadata } from "next";
import { GameCard } from "@/components/GameCard";
import { listUpcomingGames } from "@/lib/games/queries";
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

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {strings.games.listTitle}
      </h1>

      {games.length === 0 ? (
        <p className="mt-8 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.games.empty}
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {games.map(({ game, bookedCount }) => (
            <GameCard key={game.id} game={game} bookedCount={bookedCount} />
          ))}
        </div>
      )}
    </main>
  );
}
