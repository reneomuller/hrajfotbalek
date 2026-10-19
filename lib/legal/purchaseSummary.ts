import { formatCzk, formatDate } from "@/lib/format";
import { fillTemplate } from "@/lib/i18n/template";
import type { Locale } from "@/lib/i18n/locales";
import { pluralise } from "@/lib/i18n/plural";
import { policy } from "@/lib/policy";
import type { Strings } from "@/lib/strings";

/**
 * What a purchase says before it is paid (round 40) — the lawyer's Texty pro
 * web 3.2 and 4.1, filled in.
 *
 * Every card payment buys Credits (Obchodní podmínky 5.1): a single game is
 * one Credit spent at once, a pass is several. So the Credit summary goes above
 * Stripe's Pay button on EVERY checkout, and a game checkout also states the
 * booking it is about to make.
 */

/** Stripe's limit for any `custom_text` message. */
export const STRIPE_CUSTOM_TEXT_MAX = 1200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "1 Kredit" / "5 Kreditů" — capitalised, as the lawyer writes the term. */
export function creditCount(count: number, locale: Locale, t: Strings): string {
  return pluralise(
    { one: t.purchase.creditsOne, few: t.purchase.creditsFew, many: t.purchase.creditsMany },
    count,
    locale,
  );
}

/** Credits are valid `policy.credits.validityDays` from the moment they are added. */
export function creditsValidUntil(paidAt: Date): Date {
  return new Date(paidAt.getTime() + policy.credits.validityDays * DAY_MS);
}

export interface CreditPurchase {
  credits: number;
  amountCzk: number;
  /** A pass's name; absent for a single game, which is just "1 Kredit". */
  packageName?: string;
  paidAt: Date;
  termsUrl: string;
}

/** Texty 3.2 — directly above Pay. The terms link is Markdown, which Stripe renders. */
export function creditPurchaseSummary(
  purchase: CreditPurchase,
  locale: Locale,
  t: Strings,
): string {
  const count = creditCount(purchase.credits, locale, t);
  return fillTemplate(t.purchase.creditSummary, {
    credits: purchase.packageName ? `${purchase.packageName} – ${count}` : count,
    amount: formatCzk(purchase.amountCzk),
    days: String(policy.credits.validityDays),
    date: formatDate(creditsValidUntil(purchase.paidAt), locale),
    terms: `[${t.purchase.termsLinkLabel}](${purchase.termsUrl})`,
  });
}

export interface ReservationFacts {
  /** Already formatted: day, date and kick-off time. */
  when: string;
  venue: string;
  credits: number;
  /** `cancellation_refund_cutoff_hours()`, read out — never restated. */
  cutoffHours: number;
}

/** Texty 4.1 — before a booking is confirmed. */
export function reservationSummary(
  booking: ReservationFacts,
  locale: Locale,
  t: Strings,
): string {
  return fillTemplate(t.purchase.reservationSummary, {
    when: booking.when,
    venue: booking.venue,
    credits: creditCount(booking.credits, locale, t),
    hours: String(booking.cutoffHours),
    extensionDays: String(policy.credits.cancelledGameExtensionDays),
  });
}
