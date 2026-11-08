import { DATE_LOCALE, DISPLAY_TIME_ZONE, formatCzk, formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * What the dashboard's tiles and title line SAY (round 42, the admin rebuild).
 *
 * Pure, so the words are tested rather than eyeballed: each tile says what it
 * counts, because "Total players" was a different number here and on the
 * players page and neither page said which.
 *
 * EVERY TILE LINKS TO ITS HOME ROUTE — round 8's rule, which keeps this a
 * dashboard rather than a fifth place facts live.
 */
export interface DashboardWindow {
  /** Where "new players (7d)" starts — seven days before the page was read. */
  weekFrom: string;
  /** The Prague calendar month the revenue figure covers, `[from, to)`. */
  monthFrom: string;
  monthTo: string;
}

export interface TileFigures {
  upcomingGames: number;
  upcomingSeats: { taken: number; capacity: number };
  totalPlayers: number;
  newPlayers7d: number;
  revenueMonthCzk: number;
  window: DashboardWindow;
}

export interface DashboardTile {
  testId: "tile-upcoming" | "tile-players" | "tile-new-players" | "tile-revenue";
  label: string;
  value: string;
  /** Set apart from the figure and drawn smaller — only money has one. */
  unit?: string;
  detail: string;
  href: string;
}

/**
 * `formatCzk`'s output with its currency split off — the figure and the unit
 * as two strings, so the tile can draw "CZK" smaller. Split on the LAST space
 * rather than by naming the currency, so `formatCzk` stays the only place that
 * spells it.
 */
function money(amountCzk: number): { value: string; unit?: string } {
  const formatted = formatCzk(amountCzk);
  const at = formatted.lastIndexOf(" ");
  if (at < 0) return { value: formatted };
  return { value: formatted.slice(0, at), unit: formatted.slice(at + 1) };
}

/** "November 2026" — the month as Prague names it, whatever zone the server is in. */
function pragueMonth(instant: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE.en, {
    timeZone: DISPLAY_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(instant));
}

export function dashboardTiles(figures: TileFigures): DashboardTile[] {
  const copy = strings.admin.shell;
  return [
    {
      testId: "tile-upcoming",
      label: strings.admin.tileUpcoming,
      value: String(figures.upcomingGames),
      detail: copy.tileUpcomingDetail
        .replace("{taken}", String(figures.upcomingSeats.taken))
        .replace("{capacity}", String(figures.upcomingSeats.capacity)),
      href: "/admin/games",
    },
    {
      testId: "tile-players",
      label: strings.admin.tilePlayers,
      value: String(figures.totalPlayers),
      detail: copy.tilePlayersDetail,
      href: "/admin/players",
    },
    {
      testId: "tile-new-players",
      label: strings.admin.tileNewPlayers,
      value: String(figures.newPlayers7d),
      detail: copy.tileNewPlayersDetail.replace("{date}", formatDate(figures.window.weekFrom)),
      href: "/admin/players",
    },
    {
      testId: "tile-revenue",
      label: strings.admin.tileRevenue,
      ...money(figures.revenueMonthCzk),
      detail: copy.tileRevenueDetail.replace("{month}", pragueMonth(figures.window.monthFrom)),
      href: "/admin/stats",
    },
  ];
}

/** The line under the dashboard's title: does anything need a human today. */
export function attentionLede(waiting: number): string {
  const copy = strings.admin.shell;
  if (waiting <= 0) return copy.dashboardClear;
  if (waiting === 1) return copy.dashboardAttentionOne;
  return copy.dashboardAttentionMany.replace("{n}", String(waiting));
}
