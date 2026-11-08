import type { FinancialPeriod } from "@/lib/admin/financials";
import type { StatWindow } from "@/lib/stats/window";

/**
 * A link to the money page with BOTH pickers' choices in it. Each picker used
 * to link to its own parameter alone, so choosing a window put the period
 * back to this month and choosing a period put the window back to this week.
 */
export function statsHref(period: FinancialPeriod, window: StatWindow): string {
  return `/admin/stats?period=${period}&window=${window}`;
}
