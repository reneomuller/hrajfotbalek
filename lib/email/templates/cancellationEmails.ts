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

const { emails } = strings;

export interface CancellationEmailProps {
  nickname: string;
  venue: string;
  startsAt: string;
  /** Credit issued by the cancellation. Zero for an unpaid reservation. */
  creditCzk: number;
  accountUrl: string;
  /**
   * The organizer's own words for why (round 16, item 19).
   *
   * OPTIONAL, and absent is a real state rather than a gap to fill: a game
   * cancelled before the round-16 migration has no reason recorded, and
   * inventing one would be worse than the silence the email always had.
   */
  reason?: string | null;
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
    html: emailShell(
      emails.cancellationCredit.heading,
      join([
        paragraph(body),
        fact(emails.common.where, props.venue),
        fact(emails.common.when, when),
        hasCredit ? fact(emails.common.credit, formatCzk(props.creditCzk)) : null,
        button(props.accountUrl, emails.common.viewAccount),
      ]),
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

  /*
   * THE REASON GOES ABOVE THE FACTS, not below them (round 16, item 19).
   *
   * It is the thing the reader opened the email to find out. Putting it under
   * where/when/credit would make them scroll past three fields they can guess
   * to reach the one they cannot — and on a phone the credit line is often the
   * fold.
   *
   * `reason` IS THE ORGANIZER'S FREE TEXT. `paragraph` escapes it for the HTML
   * body; the text body needs no escaping.
   */
  const reason = props.reason?.trim() || null;

  return {
    subject: emails.gameCancelled.subject,
    html: emailShell(
      emails.gameCancelled.heading,
      join([
        paragraph(body),
        reason ? paragraph(reason) : null,
        fact(emails.common.where, props.venue),
        fact(emails.common.when, when),
        hasCredit ? fact(emails.common.credit, formatCzk(props.creditCzk)) : null,
        button(props.accountUrl, emails.common.findAnother),
      ]),
    ),
    text: textBody([
      emails.gameCancelled.heading,
      body,
      reason,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      hasCredit ? `${emails.common.credit}: ${formatCzk(props.creditCzk)}` : null,
      props.accountUrl,
    ]),
  };
}
