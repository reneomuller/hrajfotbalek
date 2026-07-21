import { formatCzk, formatGameDateTime } from "@/lib/format";
import { policy } from "@/lib/policy";
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

/**
 * The three cron-triggered notices, sharing one layout.
 *
 * The hour figures in the copy come from `lib/policy.ts` through
 * `{hours}` interpolation — never written into the strings as literals. A v2
 * policy that moves the nudge grace to 6h therefore moves this copy with it,
 * instead of leaving the emails quietly lying about the deadline.
 */

function withHours(template: string, hours: number): string {
  return template.replace("{hours}", String(hours));
}

export interface LifecycleEmailProps {
  nickname: string;
  venue: string;
  startsAt: string;
  gameUrl: string;
}

export interface NudgeEmailProps extends LifecycleEmailProps {
  amountDueCzk: number;
}

/** Scarcity nudge: pay within the grace window or lose the spot. */
export function nudgeEmail(props: NudgeEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const amount = formatCzk(props.amountDueCzk);
  // The deadline is the post-nudge grace, which is what `mark_nudged` writes
  // into `expires_at` and what the expiry sweep later acts on.
  const body = withHours(emails.nudge.body, policy.expiry.graceHoursAfterNudge);

  return {
    subject: emails.nudge.subject,
    html: renderEmail(
      <EmailShell heading={emails.nudge.heading}>
        <p>{body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Fact label={emails.common.amountDue} value={amount} />
        <Button href={props.gameUrl} label={emails.common.viewGame} />
      </EmailShell>,
    ),
    text: textBody([
      emails.nudge.heading,
      body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      `${emails.common.amountDue}: ${amount}`,
      props.gameUrl,
    ]),
  };
}

/** Expiry notice: the unpaid reservation lapsed and the spot went back. */
export function expiryEmail(props: LifecycleEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);

  return {
    subject: emails.expiry.subject,
    html: renderEmail(
      <EmailShell heading={emails.expiry.heading}>
        <p>{emails.expiry.body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Button href={props.gameUrl} label={emails.common.findAnother} />
      </EmailShell>,
    ),
    text: textBody([
      emails.expiry.heading,
      emails.expiry.body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      props.gameUrl,
    ]),
  };
}

/** 24h reminder to everyone holding an active spot. */
export function reminderEmail(props: LifecycleEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);
  const body = withHours(emails.reminder.body, policy.reminder.hoursBeforeStart);

  return {
    subject: emails.reminder.subject,
    html: renderEmail(
      <EmailShell heading={emails.reminder.heading}>
        <p>{body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Button href={props.gameUrl} label={emails.common.viewGame} />
        <p>{emails.common.signOff}</p>
      </EmailShell>,
    ),
    text: textBody([
      emails.reminder.heading,
      body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      props.gameUrl,
    ]),
  };
}
