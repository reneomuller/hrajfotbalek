import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";
import {
  Button,
  EmailShell,
  Fact,
  renderEmail,
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
 * The QR itself is not embedded as an image — inlined images are stripped or
 * blocked by most clients by default. The SPD string and the variable symbol
 * are both present in text, which is what a Czech banking app needs, and the
 * booking page carries the scannable code.
 */
export function spotHeldEmail(props: SpotHeldProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const amount = formatCzk(props.amountDueCzk);

  return {
    subject: emails.spotHeld.subject,
    html: renderEmail(
      <EmailShell heading={emails.spotHeld.heading}>
        <p>{emails.spotHeld.body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Fact label={emails.common.amountDue} value={amount} />
        <Fact
          label={emails.common.variableSymbol}
          value={String(props.variableSymbol)}
        />
        <Fact label={emails.spotHeld.spdLabel} value={props.spdString} />
        <Button href={props.gameUrl} label={emails.common.viewGame} />
        <p>{emails.common.signOff}</p>
      </EmailShell>,
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
    html: renderEmail(
      <EmailShell heading={emails.paymentConfirmed.heading}>
        <p>{emails.paymentConfirmed.body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Button href={props.gameUrl} label={emails.common.viewGame} />
        <p>{emails.common.signOff}</p>
      </EmailShell>,
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
