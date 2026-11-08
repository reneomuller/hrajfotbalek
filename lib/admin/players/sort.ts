import type { PlayerSegment } from "@/lib/admin/players/segments";
import type { DirectoryPlayer } from "@/lib/admin/players/types";

/**
 * Sorting the players list by a column (round 42, the admin rebuild).
 *
 * IN THE URL, as `?sort=&dir=`, like the segment and the search: the view
 * survives a reload, can be sent to somebody, and the page needs no script.
 * Each column has a natural first direction — names A to Z, everything else
 * biggest or newest first — and pressing the sorted column again flips it.
 */

export const PLAYER_SORT_KEYS = ["name", "joined", "played", "last-game", "credit"] as const;
export type PlayerSortKey = (typeof PLAYER_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface PlayerSort {
  key: PlayerSortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: PlayerSort = { key: "name", dir: "asc" };

const NATURAL_DIR: Record<PlayerSortKey, SortDir> = {
  name: "asc",
  joined: "desc",
  played: "desc",
  "last-game": "desc",
  credit: "desc",
};

const KEY_SET: ReadonlySet<string> = new Set(PLAYER_SORT_KEYS);

function isSortKey(value: string): value is PlayerSortKey {
  return KEY_SET.has(value);
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseSort(rawKey: string | string[] | undefined, rawDir: string | string[] | undefined): PlayerSort {
  const key = first(rawKey);
  if (key === undefined || !isSortKey(key)) return DEFAULT_SORT;
  const dir = first(rawDir);
  return { key, dir: dir === "asc" || dir === "desc" ? dir : NATURAL_DIR[key] };
}

/** What pressing a column's header asks for next. */
export function nextSort(current: PlayerSort, key: PlayerSortKey): PlayerSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: NATURAL_DIR[key] };
}

const NAMES = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** A column's value; null sorts last whichever way the column runs. */
const VALUE: Record<Exclude<PlayerSortKey, "name">, (p: DirectoryPlayer) => number | null> = {
  joined: (p) => Date.parse(p.createdAt),
  played: (p) => p.gamesPlayed,
  "last-game": (p) => (p.lastGameAt === null ? null : Date.parse(p.lastGameAt)),
  credit: (p) => p.balanceCzk,
};

function byName(a: DirectoryPlayer, b: DirectoryPlayer): number {
  return NAMES.compare(a.nickname, b.nickname) || a.id.localeCompare(b.id);
}

export function sortPlayers(players: DirectoryPlayer[], sort: PlayerSort): DirectoryPlayer[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") return [...players].sort((a, b) => sign * byName(a, b));

  const value = VALUE[sort.key];
  return [...players].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      if (left === right) return byName(a, b);
      return left === null ? 1 : -1;
    }
    return sign * (left - right) || byName(a, b);
  });
}

const PAGE = "/admin/players";

/** The list's address for a view, leaving out whatever is the default. */
export function playersHref(view: { segment: PlayerSegment; sort: PlayerSort; q: string }): string {
  const params = new URLSearchParams();
  if (view.segment !== "all") params.set("segment", view.segment);
  if (view.sort.key !== DEFAULT_SORT.key || view.sort.dir !== DEFAULT_SORT.dir) {
    params.set("sort", view.sort.key);
    params.set("dir", view.sort.dir);
  }
  if (view.q !== "") params.set("q", view.q);
  const query = params.toString();
  return query === "" ? PAGE : `${PAGE}?${query}`;
}
