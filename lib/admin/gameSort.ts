/**
 * How the admin games list is ordered (round 28, item 7).
 *
 * A PURE FUNCTION OVER A LIST THE PAGE ALREADY HAS, and deliberately not an
 * `order by` in the query. Two of the four keys — how full a game is, and how
 * many seats on it are unpaid — are computed from a second query and do not
 * exist as columns to sort by; pushing them into SQL would mean a view or a
 * lateral count per row to gain nothing on a list of a few hundred. Sorting
 * here also means the sort cannot disagree with what is rendered, because it
 * is the rendered array that got sorted.
 *
 * THE DEFAULT IS UNCHANGED AND THAT IS THE POINT. `date` reproduces
 * `listAllGames`'s own `order by starts_at desc` exactly, so an admin who
 * never touches the control sees the list they have always seen. A sort
 * feature whose default rearranges the page is a redesign wearing a control.
 *
 * EVERY COMPARATOR IS TOTAL AND STABLE. Ties break on kick-off, newest first,
 * so two games at the same venue or with the same number of seats free keep a
 * predictable order instead of shuffling between renders — `Array.prototype.
 * sort` is stable in modern engines, but a comparator returning 0 for
 * genuinely different rows makes the ORDER depend on the input order, which is
 * how "the list moved when I refreshed" happens.
 */

export const GAME_SORTS = ["date", "venue", "filled", "unpaid", "status"] as const;
export type GameSort = (typeof GAME_SORTS)[number];

export const DEFAULT_GAME_SORT: GameSort = "date";

export function parseGameSort(raw: string | string[] | undefined): GameSort {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (GAME_SORTS as readonly string[]).includes(value)
    ? (value as GameSort)
    : DEFAULT_GAME_SORT;
}

/** The shape this module needs. Anything wider is fine. */
export interface SortableGame {
  starts_at: string;
  venue: string;
  status: string;
  capacity: number;
  activeCount: number;
  unpaidCount: number;
}

/**
 * The status order a person reading this list cares about, which is NOT
 * alphabetical: what needs attention first, then what is coming, then what is
 * finished. `settled` last because a settled game is the one thing on this
 * page that needs nothing.
 */
const STATUS_RANK: Record<string, number> = {
  full: 0,
  published: 1,
  played: 2,
  cancelled: 3,
  settled: 4,
  draft: 5,
};

function kickoffDesc(a: SortableGame, b: SortableGame): number {
  return Date.parse(b.starts_at) - Date.parse(a.starts_at);
}

export function sortGames<T extends SortableGame>(rows: readonly T[], sort: GameSort): T[] {
  const out = [...rows];

  switch (sort) {
    case "venue":
      /*
       * `localeCompare` with no locale argument, deliberately: admin is
       * English-only and the venue names are Czech place names an admin reads
       * as labels. What matters is that "Praha 10" and "Praha 3" sort
       * predictably, not that they follow Czech collation.
       */
      return out.sort((a, b) => a.venue.localeCompare(b.venue) || kickoffDesc(a, b));

    case "filled":
      /*
       * FULLEST FIRST, AS A RATIO rather than as a raw count. A 14-seat game
       * with 12 taken and a 6-seat game with 6 taken are not the same
       * situation, and the second is the one that needs a decision. Capacity
       * zero cannot divide; it sorts as empty rather than as NaN.
       */
      return out.sort((a, b) => {
        const ratio = (g: SortableGame) => (g.capacity > 0 ? g.activeCount / g.capacity : 0);
        return ratio(b) - ratio(a) || kickoffDesc(a, b);
      });

    case "unpaid":
      // MOST UNPAID FIRST — this is the "what do I have to chase" ordering.
      return out.sort((a, b) => b.unpaidCount - a.unpaidCount || kickoffDesc(a, b));

    case "status":
      return out.sort(
        (a, b) =>
          (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99) || kickoffDesc(a, b),
      );

    case "date":
    default:
      return out.sort(kickoffDesc);
  }
}
