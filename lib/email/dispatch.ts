import { creditsFromCzk } from "@/lib/admin/credits";
import { emailEnv, emailEnvFor } from "@/lib/email/env";
import { emailLocaleFor } from "@/lib/email/recipientLocale";
import { sendRenderedEmail, type SendEmailResult } from "@/lib/email/sendEmail";
import type { EmailAttachment } from "@/lib/email/sendEmail";
import { bookingConfirmedEmail, spotHeldEmail } from "@/lib/email/templates/bookingEmails";
import {
  cancellationCreditEmail,
  gameCancelledEmail,
  type CancelOutcome,
} from "@/lib/email/templates/cancellationEmails";
import {
  creditsExpiringEmail,
  creditsPurchasedEmail,
  type CreditsExpiringProps,
  type CreditsPurchasedProps,
} from "@/lib/email/templates/creditEmails";
import { expiryEmail, nudgeEmail, reminderEmail } from "@/lib/email/templates/lifecycleEmails";
import type { RenderedEmail } from "@/lib/email/templates/layout";
import type { EmailEnv, GameFacts, PaymentReceipt } from "@/lib/email/templates/parts";
import { waitlistSpotOpenEmail } from "@/lib/email/templates/waitlistEmail";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Event → template dispatch.
 *
 * EIGHT EVENT-DRIVEN EMAILS are mapped here, one event to one template. Two
 * more go out by name rather than by event — the Credits receipt and the
 * expiry warning, `sendCredits*Email` at the bottom — and three are Supabase's
 * own (sign-in, confirm signup, change email), built in
 * `templates/authEmails.ts` but sent by its mailer, outside this seam.
 *
 * ROUND 41: every one is in the approved design and in the reader's language,
 * looked up per recipient (`lib/email/recipientLocale.ts`).
 *
 * The map is DATA, not a chain of conditionals, so a test can enumerate it and
 * assert one template per event without touching an RPC or the network.
 */

export type TemplateId =
  | "spot_held"
  | "booking_confirmed"
  | "nudge"
  | "expiry"
  | "waitlist_spot_open"
  | "cancellation_credit"
  | "game_cancelled"
  | "reminder";

export type DispatchableEvent =
  | "booking_created"
  | "payment_confirmed"
  | "nudge_sent"
  | "booking_expired"
  | "waitlist_notified"
  | "booking_cancelled"
  | "game_cancelled"
  | "reminder_sent";

export const TEMPLATE_BY_EVENT: Record<DispatchableEvent, TemplateId> = {
  booking_created: "spot_held",
  payment_confirmed: "booking_confirmed",
  nudge_sent: "nudge",
  booking_expired: "expiry",
  waitlist_notified: "waitlist_spot_open",
  booking_cancelled: "cancellation_credit",
  game_cancelled: "game_cancelled",
  reminder_sent: "reminder",
};

/** Everything any template might need. Unused fields stay undefined. */
export interface DispatchContext {
  nickname: string;
  venue: string;
  startsAt: string;
  gameUrl: string;
  accountUrl: string;
  convertUrl?: string;
  /** Round 41 — the game's length, for the When row's span. */
  durationMinutes?: number | null;
  /** Round 41 — the venue's Maps link, for the Where row. */
  mapsUrl?: string | null;
  /** Round 41 — the player plus guests on this booking. */
  places?: number;
  /** Round 41 — Credits the booking spent, shown as "Paid". */
  creditsPaid?: number | null;
  amountDueCzk?: number;
  variableSymbol?: number;
  spdString?: string;
  /** Crowns a cancellation returned to the wallet; shown as Credits, never as CZK. */
  creditCzk?: number;
  /** Round 41 — why nothing came back, when nothing did. */
  cancelOutcome?: CancelOutcome;
  /** Round 16 item 19 — the organizer's written reason for a cancellation. */
  reason?: string | null;
  ics?: EmailAttachment;
  /** Round 41 — money moved: the card receipt, the waiver and the terms. */
  receipt?: PaymentReceipt | null;
  /** Round 41 — guests added to a booking rather than a booking made. */
  bookingKind?: "booking" | "guests";
  /**
   * True when `create_booking` derived `credit` or `seed_free` — the booking
   * was confirmed in the same transaction that created it.
   */
  instantConfirmed?: boolean;
}

/**
 * Which template an event resolves to, or null for no email.
 *
 * THE ONE PIECE OF REAL LOGIC HERE: an instant-confirmed booking (a seed
 * player, or a wallet that covered the full price) emits `booking_created`
 * AND `payment_confirmed` in the same transaction. A naive map would then
 * send two emails for a booking that was never pending payment — a payment
 * request followed instantly by a receipt contradicting it. Those bookings
 * get only the receipt.
 *
 * An unmapped event is a no-op, not an error: the RPCs emit many events
 * (`spot_released`, `credit_redeemed`, `waitlist_joined`, …) that have no
 * email, and dispatch being called for them is normal.
 */
export function resolveTemplate(
  event: string,
  context?: Pick<DispatchContext, "instantConfirmed">,
): TemplateId | null {
  if (!(event in TEMPLATE_BY_EVENT)) return null;

  if (event === "booking_created" && context?.instantConfirmed) return null;

  return TEMPLATE_BY_EVENT[event as DispatchableEvent];
}

/** Renders a resolved template against the context, in the reader's language. */
export function renderTemplate(
  template: TemplateId,
  ctx: DispatchContext,
  env: EmailEnv,
): RenderedEmail {
  const game: GameFacts = {
    venue: ctx.venue,
    startsAt: ctx.startsAt,
    durationMinutes: ctx.durationMinutes ?? null,
    mapsUrl: ctx.mapsUrl ?? null,
    gameUrl: ctx.gameUrl,
  };
  const creditsReturned = creditsFromCzk(ctx.creditCzk ?? 0);

  switch (template) {
    case "spot_held":
      return spotHeldEmail(
        {
          ...game,
          amountDueCzk: ctx.amountDueCzk ?? 0,
          variableSymbol: ctx.variableSymbol ?? 0,
          spdString: ctx.spdString ?? "",
          ics: ctx.ics,
        },
        env,
      );
    case "booking_confirmed":
      return bookingConfirmedEmail(
        {
          ...game,
          kind: ctx.bookingKind ?? "booking",
          places: ctx.places ?? 1,
          creditsPaid: ctx.creditsPaid ?? null,
          ics: ctx.ics,
          receipt: ctx.receipt ?? null,
        },
        env,
      );
    case "nudge":
      return nudgeEmail({ ...game, amountDueCzk: ctx.amountDueCzk ?? 0 }, env);
    case "expiry":
      return expiryEmail(game, env);
    case "reminder":
      return reminderEmail({ ...game, places: ctx.places }, env);
    case "waitlist_spot_open":
      return waitlistSpotOpenEmail({ ...game, convertUrl: ctx.convertUrl ?? ctx.gameUrl }, env);
    case "cancellation_credit":
      return cancellationCreditEmail(
        {
          ...game,
          creditsReturned,
          outcome: ctx.cancelOutcome ?? (creditsReturned > 0 ? "credited" : "unpaid"),
        },
        env,
      );
    case "game_cancelled":
      return gameCancelledEmail(
        {
          ...game,
          creditsReturned,
          // Round 16 item 19. Null on a game cancelled before reasons existed.
          reason: ctx.reason ?? null,
        },
        env,
      );
  }
}

export interface DispatchInput {
  event: string;
  /** Null for a shadow player with no email — nothing to send, not an error. */
  to: string | null;
  context: DispatchContext;
  /** The reader's language, when the caller already knows it. Looked up otherwise. */
  locale?: Locale;
}

export type DispatchOutcome =
  | { sent: false; reason: "unmapped" | "suppressed" | "no_recipient" }
  | { sent: true; template: TemplateId; result: SendEmailResult };

/**
 * Resolves an event to its template and sends it.
 *
 * Delivery honours EMAIL_DRY_RUN inside sendEmail — nothing here decides
 * whether mail actually leaves.
 */
export async function dispatchEmail(input: DispatchInput): Promise<DispatchOutcome> {
  const template = resolveTemplate(input.event, input.context);

  if (!template) {
    const suppressed =
      input.event === "booking_created" && Boolean(input.context.instantConfirmed);
    return { sent: false, reason: suppressed ? "suppressed" : "unmapped" };
  }

  // A shadow player booked by an admin may have no email address at all.
  if (!input.to) return { sent: false, reason: "no_recipient" };

  const env = await emailEnv(input.locale ?? (await emailLocaleFor(input.to)));
  const rendered = renderTemplate(template, input.context, env);
  const result = await sendRenderedEmail(input.to, rendered);
  return { sent: true, template, result };
}

/**
 * The two Credit emails, which no booking event triggers: a purchase receipt
 * (the Stripe webhook, the admin's transfer confirmation) and the warning
 * before Credits lapse (the nightly sweep). Same seam, same language lookup.
 */
export async function sendCreditsPurchasedEmail(
  to: string,
  props: CreditsPurchasedProps,
  locale?: Locale,
): Promise<SendEmailResult> {
  const env = locale ? await emailEnv(locale) : await emailEnvFor(to);
  return sendRenderedEmail(to, creditsPurchasedEmail(props, env));
}

export async function sendCreditsExpiringEmail(
  to: string,
  props: CreditsExpiringProps,
  locale?: Locale,
): Promise<SendEmailResult> {
  const env = locale ? await emailEnv(locale) : await emailEnvFor(to);
  return sendRenderedEmail(to, creditsExpiringEmail(props, env));
}

// -----------------------------------------------------------------------------
// game-cancelled fan-out
// -----------------------------------------------------------------------------

export interface CancelledRecipient {
  bookingId: string;
  /** Null for a shadow player with no email — skipped, not an error. */
  email: string | null;
  nickname: string;
  /** Credit this cancellation returned. Zero for an unpaid reservation. */
  creditCzk: number;
}

export interface FanOutInput {
  gameId: string;
  venue: string;
  startsAt: string;
  /** Round 41 — the length and the Maps link, for the When and Where rows. */
  durationMinutes?: number | null;
  mapsUrl?: string | null;
  gameUrl: string;
  accountUrl: string;
  recipients: CancelledRecipient[];
  /** Round 16 item 19 — the organizer's written reason, sent to everyone. */
  reason?: string | null;
}

export interface FanOutSummary {
  notices: number;
  receipts: number;
  skippedNoEmail: number;
  skippedAlreadySent: number;
}

/**
 * Process-local record of what this fan-out has already sent.
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE, stated plainly because the difference
 * matters at the gate:
 *
 *   - The real retry path is already safe WITHOUT this set. `cancel_game` is a
 *     one-way transition: a second call on an cancelled game raises
 *     INVALID_TRANSITION, so the admin action never reaches the fan-out twice
 *     and a double-click sends nothing extra.
 *   - This set additionally covers a direct second call to the fan-out inside
 *     one server process, which is the resumable-partial-failure case.
 *   - It does NOT survive a process restart. Durable cross-process idempotency
 *     would need a sent-log the Phase 1 schema does not have; `events` is
 *     RPC-write-only and has no email-sent type. Adding one is a schema change
 *     that belongs in its own phase, not smuggled in here.
 */
const alreadyFannedOut = new Set<string>();

/** Test seam — resets the process-local guard. */
export function resetFanOutGuard(): void {
  alreadyFannedOut.clear();
}

/**
 * Fans the game-cancelled notice out to every affected player, plus the
 * cancellation + credit receipt to those whose money was returned.
 *
 * Two emails for a credited player is deliberate and not a duplicate: the
 * notice says the game is off, the receipt accounts for the money. Players
 * with an unpaid reservation get the notice only — there is nothing to
 * receipt, and a "0 CZK credited" receipt reads as a bug.
 */
export async function fanOutGameCancelled(input: FanOutInput): Promise<FanOutSummary> {
  const summary: FanOutSummary = {
    notices: 0,
    receipts: 0,
    skippedNoEmail: 0,
    skippedAlreadySent: 0,
  };

  for (const recipient of input.recipients) {
    if (!recipient.email) {
      summary.skippedNoEmail += 1;
      continue;
    }

    const context: DispatchContext = {
      nickname: recipient.nickname,
      venue: input.venue,
      startsAt: input.startsAt,
      gameUrl: input.gameUrl,
      accountUrl: input.accountUrl,
      creditCzk: recipient.creditCzk,
      reason: input.reason ?? null,
      durationMinutes: input.durationMinutes ?? null,
      mapsUrl: input.mapsUrl ?? null,
    };

    const sends: { event: DispatchableEvent; key: string }[] = [
      { event: "game_cancelled", key: `${input.gameId}:${recipient.bookingId}:notice` },
    ];
    if (recipient.creditCzk > 0) {
      sends.push({
        event: "booking_cancelled",
        key: `${input.gameId}:${recipient.bookingId}:receipt`,
      });
    }

    for (const send of sends) {
      if (alreadyFannedOut.has(send.key)) {
        summary.skippedAlreadySent += 1;
        continue;
      }

      const outcome = await dispatchEmail({
        event: send.event,
        to: recipient.email,
        context,
      });

      if (outcome.sent) {
        alreadyFannedOut.add(send.key);
        if (send.event === "game_cancelled") summary.notices += 1;
        else summary.receipts += 1;
      }
    }
  }

  return summary;
}
