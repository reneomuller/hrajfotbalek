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

const { emails } = strings;

export interface CancellationEmailProps {
  nickname: string;
  venue: string;
  startsAt: string;
  /** Credit issued by the cancellation. Zero for an unpaid reservation. */
  creditCzk: number;
  accountUrl: string;
}

/**
 * Cancellation + credit receipt.
 *
 * Money never leaves the system, so this is a receipt for a wallet movement
 * rather than a refund notice. When nothing had been paid the copy says so
 * instead of announcing a credit of zero — a "0 CZK credited" receipt reads
 * like a bug even though the arithmetic is right.
 */
export function cancellationCreditEmail(props: CancellationEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const hasCredit = props.creditCzk > 0;
  const body = hasCredit
    ? emails.cancellationCredit.body
    : emails.cancellationCredit.noCreditBody;

  return {
    subject: emails.cancellationCredit.subject,
    html: renderEmail(
      <EmailShell heading={emails.cancellationCredit.heading}>
        <p>{body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        {hasCredit && (
          <Fact label={emails.common.credit} value={formatCzk(props.creditCzk)} />
        )}
        <Button href={props.accountUrl} label={emails.common.viewAccount} />
      </EmailShell>,
    ),
    text: textBody([
      emails.cancellationCredit.heading,
      body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      hasCredit ? `${emails.common.credit}: ${formatCzk(props.creditCzk)}` : null,
      props.accountUrl,
    ]),
  };
}

/** Game-cancelled notice — sent to everyone who held an active booking. */
export function gameCancelledEmail(props: CancellationEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const hasCredit = props.creditCzk > 0;
  const body = hasCredit ? emails.gameCancelled.body : emails.gameCancelled.noCreditBody;

  return {
    subject: emails.gameCancelled.subject,
    html: renderEmail(
      <EmailShell heading={emails.gameCancelled.heading}>
        <p>{body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        {hasCredit && (
          <Fact label={emails.common.credit} value={formatCzk(props.creditCzk)} />
        )}
        <Button href={props.accountUrl} label={emails.common.findAnother} />
      </EmailShell>,
    ),
    text: textBody([
      emails.gameCancelled.heading,
      body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      hasCredit ? `${emails.common.credit}: ${formatCzk(props.creditCzk)}` : null,
      props.accountUrl,
    ]),
  };
}
