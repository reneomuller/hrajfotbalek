import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";
import {
  button,
  emailShell,
  fact,
  join,
  paragraph,
  textBody,
  type RenderedEmail,
} from "./layout";
import type { EmailAttachment } from "@/lib/email/sendEmail";

const { emails } = strings;

export interface BookingEmailProps {
  nickname: string;
  venue: string;
  startsAt: string;
  gameUrl: string;
  ics?: EmailAttachment;
}

export interface SpotHeldProps extends BookingEmailProps {
  amountDueCzk: number;
  variableSymbol: number;
  spdString: string;
}

/**
 * "Spot held — pay with this QR".
 *
 * A PAYMENT REQUEST, deliberately distinct from the payment-confirmed receipt
 * below. Conflating the two was an explicit specification correction: they
 * answer different questions ("what do I owe" vs "am I in"), and a player who
 * receives the receipt copy while still owing money will not pay.
 *
 * The QR image is not embedded — most clients block remote and inline images by
 * default. The SPD string and the variable symbol are both present as text,
 * which is what a Czech banking app needs, and the booking page carries the
 * scannable code.
 */
export function spotHeldEmail(props: SpotHeldProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const amount = formatCzk(props.amountDueCzk);

  return {
    subject: emails.spotHeld.subject,
    html: emailShell(
      emails.spotHeld.heading,
      join([
        paragraph(emails.spotHeld.body),
        fact(emails.common.where, props.venue),
        fact(emails.common.when, when),
        fact(emails.common.amountDue, amount),
        fact(emails.common.variableSymbol, String(props.variableSymbol)),
        fact(emails.spotHeld.spdLabel, props.spdString),
        button(props.gameUrl, emails.common.viewGame),
        paragraph(emails.common.signOff),
      ]),
    ),
    text: textBody([
      emails.spotHeld.heading,
      emails.spotHeld.body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      `${emails.common.amountDue}: ${amount}`,
      `${emails.common.variableSymbol}: ${props.variableSymbol}`,
      `${emails.spotHeld.spdLabel}: ${props.spdString}`,
      props.gameUrl,
    ]),
    attachments: props.ics ? [props.ics] : undefined,
  };
}

/** "Payment confirmed" — the receipt. */
export function paymentConfirmedEmail(props: BookingEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);

  return {
    subject: emails.paymentConfirmed.subject,
    html: emailShell(
      emails.paymentConfirmed.heading,
      join([
        paragraph(emails.paymentConfirmed.body),
        fact(emails.common.where, props.venue),
        fact(emails.common.when, when),
        button(props.gameUrl, emails.common.viewGame),
        paragraph(emails.common.signOff),
      ]),
    ),
    text: textBody([
      emails.paymentConfirmed.heading,
      emails.paymentConfirmed.body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      props.gameUrl,
    ]),
    attachments: props.ics ? [props.ics] : undefined,
  };
}
