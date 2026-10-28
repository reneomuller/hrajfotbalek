import type { EmailAttachment } from "@/lib/email/sendEmail";
import {
  formatCzk,
  formatDate,
  formatGameDate,
  formatGameDateTime,
  formatTime,
  formatTimeSpan,
} from "@/lib/format";
import type { Locale } from "@/lib/i18n/locales";
import { pluralise } from "@/lib/i18n/plural";
import { fillTemplate } from "@/lib/i18n/template";
import { OPERATOR_CONTACT, TERMS_PDF_PATH, TERMS_RULES_ANCHOR } from "@/lib/legal";
import { creditCount } from "@/lib/legal/purchaseSummary";
import type { Strings } from "@/lib/strings";
import { emailLink, html, join, type EmailReceipt, type EmailRow, type SafeHtml } from "./layout";

/**
 * What every template needs besides its own facts (round 41): the reader's
 * language and its string table, the site's origin, and the database's
 * cancellation cutoff — so the rule an email states is the rule `cancel_booking`
 * enforces, never a number typed into copy.
 */
export interface EmailEnv {
  locale: Locale;
  t: Strings;
  baseUrl: string;
  cutoffHours: number;
}

/** The facts about a game that any game email shows. */
export interface GameFacts {
  venue: string;
  startsAt: string;
  /** Null for a game created before lengths existed — the row shows the start only. */
  durationMinutes?: number | null;
  /** The venue's own Maps link; absent renders the venue name alone. */
  mapsUrl?: string | null;
  gameUrl: string;
}

/** Money that moved, on a receipt (Texty pro web 5.1). */
export interface PaymentReceipt {
  /** Any id of the purchase; shown as `HF-` and its last eight characters. */
  orderId: string;
  paidAt: string;
  credits: number;
  amountCzk: number;
  method: "card" | "transfer";
  /** When the Credits lapse (60 days from payment). */
  validUntil: string;
  /** A single-game purchase: the Credit was spent on the spot. */
  usedForGame?: boolean;
  /** The box above Pay exactly as ticked, and when — from the checkout's consent. */
  terms?: { wording: string; acceptedAt: string } | null;
  variableSymbol?: number | null;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return fillTemplate(
    template,
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
  );
}

export function credits(env: EmailEnv, count: number): string {
  return creditCount(count, env.locale, env.t);
}

function places(env: EmailEnv, count: number): string {
  const { common } = env.t.emails;
  return fillTemplate(
    pluralise({ one: common.placesOne, few: common.placesFew, many: common.placesMany }, count, env.locale),
    { n: String(count) },
  );
}

function guests(env: EmailEnv, count: number): string {
  const { common } = env.t.emails;
  return fillTemplate(
    pluralise({ one: common.guestsOne, few: common.guestsFew, many: common.guestsMany }, count, env.locale),
    { n: String(count) },
  );
}

/** "Sun 25 Oct 15:00" — subjects and sentences. */
export function when(env: EmailEnv, startsAt: string): string {
  return formatGameDateTime(startsAt, env.locale);
}

/** The When row: the date and the whole span, when the length is known. */
export function whenRow(env: EmailEnv, game: GameFacts): EmailRow {
  const value = game.durationMinutes
    ? `${formatGameDate(game.startsAt, env.locale)} · ${formatTimeSpan(
        game.startsAt,
        new Date(Date.parse(game.startsAt) + game.durationMinutes * 60_000),
        env.locale,
      )}`
    : when(env, game.startsAt);
  return { label: env.t.emails.common.when, value };
}

export function whereRow(env: EmailEnv, game: GameFacts): EmailRow {
  const { common } = env.t.emails;
  if (!game.mapsUrl) return { label: common.where, value: game.venue };
  return {
    label: common.where,
    value: html`${game.venue} · ${emailLink(game.mapsUrl, `${common.openMaps}\u00a0→`)}`,
    text: `${game.venue} · ${game.mapsUrl}`,
  };
}

export function playersRow(env: EmailEnv, count: number): EmailRow {
  const { common } = env.t.emails;
  const value =
    count <= 1
      ? `${common.you} · ${places(env, 1)}`
      : `${common.you} + ${guests(env, count - 1)} · ${places(env, count)}`;
  return { label: common.players, value };
}

export function placesPhrase(env: EmailEnv, count: number): string {
  return places(env, count);
}

/** The 12-hour rule, with the button's own label quoted. */
export function cancelRule(env: EmailEnv): string {
  return fill(env.t.emails.common.cancelRule, {
    hours: env.cutoffHours,
    cantMakeIt: env.t.booking.cantMakeIt,
  });
}

function questionsLine(env: EmailEnv): SafeHtml {
  const [before, after = ""] = env.t.emails.common.questions.split("{email}");
  return html`${before}${emailLink(`mailto:${OPERATOR_CONTACT.email}`, OPERATOR_CONTACT.email, "quiet")}${after}`;
}

/**
 * The small print under a booking (Texty 5.2, minus what the owner removed):
 * no withdrawal from a dated leisure service, the rules, where to write — and,
 * on a purchase, that the terms are attached.
 */
export function bookingSmallPrint(env: EmailEnv, { purchase }: { purchase: boolean }): (string | SafeHtml)[] {
  const { common } = env.t.emails;
  const rules = emailLink(`${env.baseUrl}/terms#${TERMS_RULES_ANCHOR}`, common.rulesLink, "quiet");
  return [
    common.noWithdrawal,
    join([rules, html`. `, questionsLine(env)]),
    ...(purchase ? [common.termsAttached] : []),
  ];
}

/** The small print under a Credit purchase: where to write, and the attached terms. */
export function purchaseSmallPrint(env: EmailEnv): (string | SafeHtml)[] {
  return [questionsLine(env), env.t.emails.common.termsAttached];
}

/** Questions only — every other email. */
export function plainSmallPrint(env: EmailEnv): (string | SafeHtml)[] {
  return [questionsLine(env)];
}

function stamp(env: EmailEnv, at: string): string {
  return `${formatDate(at, env.locale)}, ${formatTime(at, env.locale)}`;
}

export function orderNumber(orderId: string): string {
  return `HF-${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;
}

export function receipt(env: EmailEnv, paid: PaymentReceipt): EmailReceipt {
  const r = env.t.emails.receipt;
  const valid = formatDate(paid.validUntil, env.locale);
  const method =
    paid.method === "card"
      ? r.card
      : paid.variableSymbol
        ? `${r.bankTransfer} · ${env.t.emails.common.variableSymbol} ${paid.variableSymbol}`
        : r.bankTransfer;
  return {
    title: r.title,
    rows: [
      { label: r.order, value: `${orderNumber(paid.orderId)} · ${stamp(env, paid.paidAt)}` },
      { label: credits(env, paid.credits), value: formatCzk(paid.amountCzk) },
      { label: r.validUntil, value: paid.usedForGame ? `${valid} · ${r.usedForGame}` : valid },
      { label: r.paidBy, value: method },
    ],
    note: paid.terms
      ? fill(r.termsNote, { wording: paid.terms.wording, time: stamp(env, paid.terms.acceptedAt) })
      : null,
  };
}

/**
 * The terms as they stand today, attached to every purchase (Texty 5.1).
 * By URL: Resend fetches it, so the PDF need not travel in the function bundle.
 */
export function termsAttachment(env: EmailEnv): EmailAttachment {
  return {
    filename: "Hraj-Fotbal-obchodni-podminky.pdf",
    path: `${env.baseUrl}${TERMS_PDF_PATH}`,
    contentType: "application/pdf",
  };
}
