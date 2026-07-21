import { sendRenderedEmail, type SendEmailResult } from "@/lib/email/sendEmail";
import {
  paymentConfirmedEmail,
  spotHeldEmail,
} from "@/lib/email/templates/bookingEmails";
import {
  cancellationCreditEmail,
  gameCancelledEmail,
} from "@/lib/email/templates/cancellationEmails";
import {
  expiryEmail,
  nudgeEmail,
  reminderEmail,
} from "@/lib/email/templates/lifecycleEmails";
import { waitlistSpotOpenEmail } from "@/lib/email/templates/waitlistEmail";
import type { RenderedEmail } from "@/lib/email/templates/layout";
import type { EmailAttachment } from "@/lib/email/sendEmail";

/**
 * Event → template dispatch.
 *
 * NINE transactional emails exist. EIGHT are in-app templates and each is
 * mapped here, one event to one template. The ninth — `magic_link` — is
 * delivered by Supabase's built-in mailer, is deliberately absent from this
 * map, and stays outside the sendEmail()/dry-run seam for all of Phase 1.
 *
 * The map is DATA, not a chain of conditionals, so a test can enumerate it and
 * assert one template per event without touching an RPC or the network.
 */

export type TemplateId =
  | "spot_held"
  | "payment_confirmed"
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
  payment_confirmed: "payment_confirmed",
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
  amountDueCzk?: number;
  variableSymbol?: number;
  spdString?: string;
  creditCzk?: number;
  ics?: EmailAttachment;
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

/** Renders a resolved template against the context. */
export function renderTemplate(
  template: TemplateId,
  ctx: DispatchContext,
): RenderedEmail {
  const base = {
    nickname: ctx.nickname,
    venue: ctx.venue,
    startsAt: ctx.startsAt,
    gameUrl: ctx.gameUrl,
  };

  switch (template) {
    case "spot_held":
      return spotHeldEmail({
        ...base,
        amountDueCzk: ctx.amountDueCzk ?? 0,
        variableSymbol: ctx.variableSymbol ?? 0,
        spdString: ctx.spdString ?? "",
        ics: ctx.ics,
      });
    case "payment_confirmed":
      return paymentConfirmedEmail({ ...base, ics: ctx.ics });
    case "nudge":
      return nudgeEmail({ ...base, amountDueCzk: ctx.amountDueCzk ?? 0 });
    case "expiry":
      return expiryEmail(base);
    case "reminder":
      return reminderEmail(base);
    case "waitlist_spot_open":
      return waitlistSpotOpenEmail({
        ...base,
        convertUrl: ctx.convertUrl ?? ctx.gameUrl,
      });
    case "cancellation_credit":
      return cancellationCreditEmail({
        ...base,
        creditCzk: ctx.creditCzk ?? 0,
        accountUrl: ctx.accountUrl,
      });
    case "game_cancelled":
      return gameCancelledEmail({
        ...base,
        creditCzk: ctx.creditCzk ?? 0,
        accountUrl: ctx.accountUrl,
      });
  }
}

export interface DispatchInput {
  event: string;
  /** Null for a shadow player with no email — nothing to send, not an error. */
  to: string | null;
  context: DispatchContext;
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

  const rendered = renderTemplate(template, input.context);
  const result = await sendRenderedEmail(input.to, rendered);
  return { sent: true, template, result };
}
