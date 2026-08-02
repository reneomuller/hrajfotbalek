import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminStats, ratio } from "@/lib/stats/queries";
import { isStatWindow, type StatWindow } from "@/lib/stats/window";

/**
 * `/admin/stats/export` — the numbers for a window, as name/value rows.
 *
 * NOT A TABLE OF ROWS, because the stats page is not a list of things. It is
 * five ratios over a period, and the honest CSV shape for that is one row per
 * measurement with its numerator and denominator beside it — so a reader can
 * see that a 12% no-show rate is three of twenty-five rather than one of eight,
 * which is the difference between a signal and a coincidence.
 *
 * THE WINDOW IS ECHOED IN THE FILE. The range's start and end are the first two
 * rows, because a stats file with no period on it is a set of numbers nobody
 * can put back in context a month later — and this is the export most likely to
 * be kept.
 *
 * `?window=` is validated against the closed set rather than passed through: it
 * reaches `statRange`, and an unrecognised value should produce the default
 * period rather than an error page or an empty file.
 */
export const dynamic = "force-dynamic";

interface StatLine {
  metric: string;
  value: string;
  numerator: number | null;
  denominator: number | null;
}

const COLUMNS: CsvColumn<StatLine>[] = [
  { header: "metric", value: (r) => r.metric },
  { header: "value", value: (r) => r.value },
  { header: "numerator", value: (r) => r.numerator },
  { header: "denominator", value: (r) => r.denominator },
];

export async function GET(request: Request) {
  await requireAdmin();

  const requested = new URL(request.url).searchParams.get("window");
  // The same guard the page uses, so the file and the screen can never be
  // reporting different periods from the same query string.
  const window: StatWindow = isStatWindow(requested) ? requested : "month";

  const stats = await getAdminStats(window);

  const lines: StatLine[] = [
    {
      metric: "range_from_utc",
      value: stats.range.from,
      numerator: null,
      denominator: null,
    },
    {
      // EXCLUSIVE upper bound, and named so. A reader who takes it for the last
      // included instant double-counts the boundary game.
      metric: "range_to_utc_exclusive",
      value: stats.range.to,
      numerator: null,
      denominator: null,
    },
    {
      metric: "no_show_rate",
      value: ratio(stats.noShow.noShows, stats.noShow.marked),
      numerator: stats.noShow.noShows,
      denominator: stats.noShow.marked,
    },
    {
      metric: "fill_rate",
      value: ratio(stats.fillRate.sold, stats.fillRate.capacity),
      numerator: stats.fillRate.sold,
      denominator: stats.fillRate.capacity,
    },
    {
      metric: "confirmed_revenue_czk",
      value: String(stats.confirmedRevenueCzk),
      numerator: stats.confirmedRevenueCzk,
      denominator: null,
    },
    {
      metric: "new_players",
      value: String(stats.newReturning.newPlayers),
      numerator: stats.newReturning.newPlayers,
      denominator: null,
    },
    {
      metric: "returning_players",
      value: String(stats.newReturning.returning),
      numerator: stats.newReturning.returning,
      denominator: null,
    },
    {
      metric: "cancellations",
      value: String(stats.cancellations.total),
      numerator: stats.cancellations.total,
      denominator: null,
    },
    {
      metric: "cancellations_with_credit",
      value: ratio(stats.cancellations.withCredit, stats.cancellations.total),
      numerator: stats.cancellations.withCredit,
      denominator: stats.cancellations.total,
    },
  ];

  return csvResponse(toCsv(COLUMNS, lines), `stats-${window}`, csvDateStamp());
}
