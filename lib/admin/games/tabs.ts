import { DEFAULT_GAME_SORT, type GameSort } from "@/lib/admin/gameSort";

/**
 * The games list's three tabs (round 42, the admin rebuild).
 *
 * ~~One list, newest first, every status mixed together.~~ The owner found the
 * admin "not very appealing at all or easy to navigate", and the list was the
 * worst of it: next Sunday's game sat between a settled fixture from August and
 * a cancelled one, and the only way to tell them apart was a word in 12px grey.
 *
 * DECIDED BY THE CLOCK AS WELL AS THE STATUS. A game whose kick-off has passed
 * is over, whether or not the nightly sweep has marked it `played` yet — so a
 * `published` game from last night is under Played, where its money and its
 * attendance are, rather than under Upcoming pretending it can still fill.
 *
 * IN THE URL, like the sort: a tab survives a reload, can be sent to somebody,
 * and keeps the page a server component that renders only the rows it shows.
 */
export const GAME_TABS = ["upcoming", "played", "cancelled"] as const;
export type GameTab = (typeof GAME_TABS)[number];

export const DEFAULT_GAME_TAB: GameTab = "upcoming";

/** Statuses that are over whatever the clock says. */
const OVER: ReadonlySet<string> = new Set(["played", "settled"]);

export function parseGameTab(raw: string | string[] | undefined): GameTab {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (GAME_TABS as readonly string[]).includes(value) ? (value as GameTab) : DEFAULT_GAME_TAB;
}

/** The shape this module needs. Anything wider is fine. */
export interface TabbableGame {
  status: string;
  starts_at: string;
}

/**
 * Which tab a game belongs under. The clock is a parameter, read by the caller
 * through the default — a render must stay pure, and the page is force-dynamic,
 * so every request reads it fresh.
 */
export function gameTabOf(game: TabbableGame, now: number = Date.now()): GameTab {
  if (game.status === "cancelled") return "cancelled";
  if (OVER.has(game.status)) return "played";
  return Date.parse(game.starts_at) <= now ? "played" : "upcoming";
}

/** Every tab's rows, each in the order it was given. */
export function groupGamesByTab<T extends TabbableGame>(
  games: readonly T[],
  now: number = Date.now(),
): Record<GameTab, T[]> {
  const groups: Record<GameTab, T[]> = { upcoming: [], played: [], cancelled: [] };
  for (const game of games) groups[gameTabOf(game, now)].push(game);
  return groups;
}

/**
 * The game that kicks off first — the page header's "next up", whatever order
 * the admin has sorted the list into.
 */
export function soonestGame<T extends { starts_at: string }>(games: readonly T[]): T | null {
  let soonest: T | null = null;
  for (const game of games) {
    if (!soonest || Date.parse(game.starts_at) < Date.parse(soonest.starts_at)) soonest = game;
  }
  return soonest;
}

/**
 * A games-list URL that says only what differs from the defaults, so the plain
 * list stays `/admin/games` — the address every bookmark, the nav chip and the
 * published banner's way back already use.
 */
export function gamesListHref({ tab, sort }: { tab: GameTab; sort: GameSort }): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_GAME_TAB) params.set("tab", tab);
  if (sort !== DEFAULT_GAME_SORT) params.set("sort", sort);
  const query = params.toString();
  return query ? `/admin/games?${query}` : "/admin/games";
}
