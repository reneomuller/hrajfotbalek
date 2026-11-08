import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { statRange } from "@/lib/stats/window";

/**
 * The money page's calendar (round 42, the admin rebuild): Prague months and
 * the weeks inside them.
 *
 * ~~MONTHS ARE UTC~~, on the grounds that "no reader is counting". The owner
 * is. A game paid at 00:30 on the 1st, Prague time, is 23:30 UTC on the last
 * day of the month before, and the page filed it there — so "this month"
 * started an hour (two in summer) late and "last month" kept the first hour
 * of this one. Every period is now a Prague calendar month, from the same
 * `statRange` the operations windows use, so the two halves of the page agree
 * about where a month begins.
 *
 * Pure: every function takes its instant rather than reading the clock.
 */

export interface MonthBounds {
  /** Inclusive ISO lower bound: midnight on the 1st, Prague time. */
  from: string;
  /** EXCLUSIVE ISO upper bound: midnight on the 1st of the next month. */
  to: string;
}

export interface WeekBar {
  /** `W1`…`W5` — the frame's own labels. */
  label: string;
  revenueCzk: number;
}

/** The longest a month runs in weeks from the 1st: days 29–31 are week five. */
const MAX_WEEKS = 5;
const DAYS_PER_WEEK = 7;

/**
 * The Prague calendar month containing `now`, or `monthsBack` months before
 * it. Stepping back by "one millisecond before this month began" rather than
 * by date arithmetic, so a month of 30 days, a February and a clock change
 * each come out of `statRange` rather than out of a sum.
 */
export function pragueMonth(now: Date | number | string, monthsBack = 0): MonthBounds {
  let range = statRange("month", new Date(now));
  for (let step = 0; step < monthsBack; step += 1) {
    range = statRange("month", Date.parse(range.from) - 1);
  }
  return { from: range.from, to: range.to };
}

/** The day of the month an instant falls on in Prague, 1–31. */
export function pragueDayOfMonth(at: Date | number | string): number {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TIME_ZONE, day: "numeric" }).format(
    new Date(at),
  );
  return Number(day);
}

/**
 * Which bar a payment belongs on: days 1–7 are W1, 8–14 W2, and so on.
 *
 * BY THE PRAGUE DAY, NOT BY ELAPSED MILLISECONDS. Dividing the time since the
 * 1st by seven days is an hour out for every week after a clock change, which
 * moves 23:30 on the 28th of October into week five.
 */
export function weekOfMonth(at: Date | number | string): number {
  return Math.min(MAX_WEEKS - 1, Math.floor((pragueDayOfMonth(at) - 1) / DAYS_PER_WEEK));
}

/** How many bars a month draws: four for a 28-day February, five otherwise. */
export function weeksInMonth(bounds: MonthBounds): number {
  const lastDay = pragueDayOfMonth(Date.parse(bounds.to) - 1);
  return Math.min(MAX_WEEKS, Math.ceil(lastDay / DAYS_PER_WEEK));
}

/**
 * Payments in a month as the week chart's bars. EMPTY WHEN NOTHING WAS PAID —
 * the page draws no chart rather than five baselines.
 */
export function bucketByWeek(payments: readonly { at: string; czk: number }[], bounds: MonthBounds): WeekBar[] {
  if (payments.length === 0) return [];

  const totals = new Map<number, number>();
  for (const payment of payments) {
    const week = weekOfMonth(payment.at);
    totals.set(week, (totals.get(week) ?? 0) + payment.czk);
  }

  return Array.from({ length: weeksInMonth(bounds) }, (_, i) => ({
    label: `W${i + 1}`,
    revenueCzk: totals.get(i) ?? 0,
  }));
}
