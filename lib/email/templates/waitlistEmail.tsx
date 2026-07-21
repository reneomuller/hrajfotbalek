import { formatGameDateTime } from "@/lib/format";
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

export interface WaitlistEmailProps {
  nickname: string;
  venue: string;
  startsAt: string;
  /** Deep link that converts the waitlist row into a booking. */
  convertUrl: string;
}

/**
 * Waitlist spot-open.
 *
 * Every active waitlisted player receives this at the same moment — the race
 * is settled by `create_booking`'s transactional capacity check, not by a
 * queue. The copy says so plainly, because losing the race is a normal outcome
 * that many recipients will hit and a surprise refusal reads as a bug.
 */
export function waitlistSpotOpenEmail(props: WaitlistEmailProps): RenderedEmail {
  const when = formatGameDateTime(props.startsAt);

  return {
    subject: emails.waitlistSpotOpen.subject,
    html: renderEmail(
      <EmailShell heading={emails.waitlistSpotOpen.heading}>
        <p>{emails.waitlistSpotOpen.body}</p>
        <Fact label={emails.common.where} value={props.venue} />
        <Fact label={emails.common.when} value={when} />
        <Button href={props.convertUrl} label={emails.waitlistSpotOpen.cta} />
      </EmailShell>,
    ),
    text: textBody([
      emails.waitlistSpotOpen.heading,
      emails.waitlistSpotOpen.body,
      `${emails.common.where}: ${props.venue}`,
      `${emails.common.when}: ${when}`,
      props.convertUrl,
    ]),
  };
}
