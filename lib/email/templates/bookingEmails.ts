import type { EmailAttachment } from "@/lib/email/sendEmail";
import { formatCzk } from "@/lib/format";
import { renderEmail, type RenderedEmail } from "./layout";
import {
  bookingSmallPrint,
  cancelRule,
  credits,
  fill,
  placesPhrase,
  plainSmallPrint,
  playersRow,
  receipt,
  termsAttachment,
  when,
  whenRow,
  whereRow,
  type EmailEnv,
  type GameFacts,
  type PaymentReceipt,
} from "./parts";

export interface BookingConfirmedProps extends GameFacts {
  /** A booking, or guests added to one (round 34's add-guests checkout). */
  kind?: "booking" | "guests";
  /** Everyone this booking holds a place for: the player plus guests. */
  places: number;
  /** Credits the booking spent. Null when nothing was spent (a seed player). */
  creditsPaid: number | null;
  ics?: EmailAttachment;
  /** Present when money moved for this booking — a card checkout. */
  receipt?: PaymentReceipt | null;
}

/**
 * "You're in." — THE TEMPLATE the owner approved (2026-10-19), and the email
 * every confirmed booking gets: paid from Credits already held, paid by card
 * (with the receipt and the terms attached), or guests added.
 */
export function bookingConfirmedEmail(props: BookingConfirmedProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const copy = props.kind === "guests" ? e.guestsAdded : e.bookingConfirmed;
  const values = {
    when: when(env, props.startsAt),
    venue: props.venue,
    hours: env.cutoffHours,
    places: placesPhrase(env, props.places),
  };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(copy.subject, values),
    preheader: fill(copy.preheader, values),
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    lede: fill(copy.lede, values),
    rows: [
      whenRow(env, props),
      whereRow(env, props),
      playersRow(env, props.places),
      ...(props.creditsPaid
        ? [{ label: e.common.paid, value: credits(env, props.creditsPaid) }]
        : []),
    ],
    cta: { href: props.gameUrl, label: e.common.seeLineup },
    ctaNote: props.ics ? e.common.calendarNote : null,
    rule: cancelRule(env),
    receipt: props.receipt ? receipt(env, props.receipt) : null,
    smallPrint: bookingSmallPrint(env, { purchase: Boolean(props.receipt) }),
    footer: e.common.footerBooked,
    attachments: [
      ...(props.ics ? [props.ics] : []),
      ...(props.receipt ? [termsAttachment(env)] : []),
    ],
  });
}

export interface SpotHeldProps extends GameFacts {
  amountDueCzk: number;
  variableSymbol: number;
  spdString: string;
  ics?: EmailAttachment;
}

/**
 * "Your spot is held." — A PAYMENT REQUEST, deliberately distinct from the
 * confirmation: they answer different questions ("what do I owe" vs "am I
 * in"), and a player who reads a confirmation while still owing will not pay.
 *
 * The QR image is not embedded — most clients block images by default. The
 * SPD string and the variable symbol are both here as text, which is what a
 * Czech banking app needs, and the game page carries the scannable code.
 */
export function spotHeldEmail(props: SpotHeldProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const amount = formatCzk(props.amountDueCzk);
  const values = {
    when: when(env, props.startsAt),
    venue: props.venue,
    amount,
    vs: props.variableSymbol,
  };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(e.spotHeld.subject, values),
    preheader: fill(e.spotHeld.preheader, values),
    eyebrow: e.spotHeld.eyebrow,
    headline: e.spotHeld.headline,
    lede: fill(e.spotHeld.lede, values),
    rows: [
      whenRow(env, props),
      whereRow(env, props),
      { label: e.common.toPay, value: amount },
      { label: e.common.variableSymbol, value: String(props.variableSymbol) },
      { label: e.spotHeld.spdLabel, value: props.spdString },
    ],
    cta: { href: props.gameUrl, label: e.spotHeld.cta },
    smallPrint: plainSmallPrint(env),
    footer: e.common.footerBooked,
    attachments: props.ics ? [props.ics] : [],
  });
}
