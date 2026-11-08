import Link from "next/link";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { GameRow } from "@/components/admin/games/GameRow";
import { GamesTiles } from "@/components/admin/games/GamesTiles";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SegmentTabs } from "@/components/admin/ui/SegmentTabs";
import { getGameEconomics, type GameEconomics } from "@/lib/admin/economics";
import { getCancelReasons } from "@/lib/admin/games/queries";
import { summariseGames } from "@/lib/admin/games/summary";
import {
  GAME_TABS,
  gamesListHref,
  groupGamesByTab,
  parseGameTab,
  soonestGame,
} from "@/lib/admin/games/tabs";
import { GAME_SORTS, parseGameSort, sortGames } from "@/lib/admin/gameSort";
import { listAllGames } from "@/lib/admin/queries";
import { appCapabilities } from "@/lib/db/capabilities";
import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.admin.gamesTitle };

export const dynamic = "force-dynamic";

const hub = strings.admin.gamesHub;

/**
 * Every game, by where it stands (round 42, the admin rebuild): Upcoming,
 * Played, Cancelled — tabs in the URL, the sort beside them, and on each row a
 * seat bar with the break-even line.
 *
 * Read through the service-role client (see `lib/admin/queries.ts`): the public
 * RLS policy hides drafts and cancelled games from every `authenticated`
 * session, admins included, and it is not widened for admins on purpose.
 * Drafts stay out of the list (round 9, item 7) — creating a game publishes it.
 *
 * THE MONEY WAITS FOR `pitchCosts`. Before the migration `game_economics` does
 * not exist and PostgREST answers a missing function with a 404, so the bar,
 * the break-even line and the profit are simply not drawn — the list is then
 * the list it was, in tabs.
 */
export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = searchParams ? await searchParams : {};
  /*
   * THE SORT AND THE TAB ARE IN THE URL, not in component state (round 28,
   * item 7). An ordering is shareable and bookmarkable, it survives the back
   * button, and the page stays a server component that renders only its rows.
   */
  const sort = parseGameSort(query.sort);
  const tab = parseGameTab(query.tab);

  const [allGames, capabilities] = await Promise.all([listAllGames(), appCapabilities()]);
  const groups = groupGamesByTab(allGames);
  const games = sortGames(groups[tab], sort);
  const ids = games.map((game) => game.id);

  const [economics, reasons] = await Promise.all([
    capabilities.pitchCosts && tab !== "cancelled"
      ? getGameEconomics(ids)
      : Promise.resolve<Map<string, GameEconomics> | null>(null),
    tab === "cancelled" ? getCancelReasons(ids) : Promise.resolve(new Map<string, string>()),
  ]);

  const next = soonestGame(groups.upcoming);

  return (
    <>
      <PageHeader
        title={strings.admin.gamesTitle}
        lede={
          next
            ? hub.nextUp
                .replace("{when}", formatGameDateTime(next.starts_at))
                .replace("{venue}", next.venue)
            : hub.nothingNext
        }
        actions={
          <>
            <ExportCsvLink href="/admin/games/export" testId="export-games" />
            <Link
              href="/admin/games/new"
              data-testid="new-game"
              className="inline-flex min-h-11 items-center rounded-control bg-volt px-5 text-[15px] font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {strings.admin.newGame}
            </Link>
          </>
        }
      />

      <div className="mt-5">
        <SegmentTabs
          label={hub.tabsLabel}
          testId="games-tabs"
          current={tab}
          tabs={GAME_TABS.map((key) => ({
            key,
            label: hub.tabs[key],
            href: gamesListHref({ tab: key, sort }),
            count: groups[key].length,
          }))}
        />
      </div>

      {games.length > 0 && (
        <div className="mt-5">
          <GamesTiles tab={tab} summary={summariseGames(games, economics)} />
        </div>
      )}

      {/*
        THE SORT CONTROL — links, not a select (round 28, item 7). A `<select>`
        needs JavaScript to navigate on change; five links are five URLs, and
        the CURRENT one is stated rather than implied. Each keeps the tab.
      */}
      <nav
        aria-label={strings.admin.sortLabel}
        data-testid="games-sort"
        className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <span className="text-[10px] uppercase tracking-eyebrow text-muted">{strings.admin.sortLabel}</span>
        {GAME_SORTS.map((key) => (
          <Link
            key={key}
            href={gamesListHref({ tab, sort: key })}
            data-testid={`games-sort-${key}`}
            aria-current={sort === key ? "true" : undefined}
            className={
              sort === key
                ? "rounded-pill border border-volt bg-volt/[.10] px-3 py-1 text-[11px] uppercase tracking-eyebrow text-volt no-underline"
                : "rounded-pill border border-hairline px-3 py-1 text-[11px] uppercase tracking-eyebrow text-muted no-underline transition-colors hover:border-volt hover:text-volt"
            }
          >
            {strings.admin.sortKeys[key]}
          </Link>
        ))}
      </nav>

      {games.length === 0 ? (
        <p data-testid="games-empty" className="mt-8 text-[12px] tracking-[1px] text-faint">
          {allGames.length === 0 ? strings.admin.gamesEmpty : hub.empty[tab]}
        </p>
      ) : (
        <ul data-testid="admin-game-list" className="mt-4 list-none space-y-2 p-0">
          {games.map((game, index) => (
            <GameRow
              key={game.id}
              game={game}
              // Counted from the oldest row on the tab — see GameRow.
              ordinal={games.length - index}
              tab={tab}
              economics={economics?.get(game.id) ?? null}
              reason={reasons.get(game.id) ?? null}
            />
          ))}
        </ul>
      )}
    </>
  );
}
