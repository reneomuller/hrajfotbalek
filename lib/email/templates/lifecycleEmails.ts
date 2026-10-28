import { formatCzk, formatTime } from "@/lib/format";
import { policy } from "@/lib/policy";
import { renderEmail, type RenderedEmail } from "./layout";
import {
  cancelRule,
  fill,
  plainSmallPrint,
  playersRow,
  when,
  whenRow,
  whereRow,
  type EmailEnv,
  type GameFacts,
} from "./parts";

export interface NudgeEmailProps extends GameFacts {
  amountDueCzk: number;
}

/** "Pay now or lose your spot" — the morning sweep, on a full game. */
export function nudgeEmail(props: NudgeEmailProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const amount = formatCzk(props.amountDueCzk);
  // The deadline is the post-nudge grace, which is exactly what `mark_nudged`
  // writes into `expires_at` and what the expiry sweep later acts on.
  const values = {
    when: when(env, props.startsAt),
    venue: props.venue,
    hours: policy.expiry.graceHoursAfterNudge,
  };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(e.nudge.subject, values),
    preheader: fill(e.nudge.preheader, values),
    eyebrow: e.nudge.eyebrow,
    headline: e.nudge.headline,
    lede: fill(e.nudge.lede, values),
    rows: [whenRow(env, props), whereRow(env, props), { label: e.common.toPay, value: amount }],
    cta: { href: props.gameUrl, label: e.nudge.cta },
    smallPrint: plainSmallPrint(env),
    footer: e.common.footerBooked,
  });
}

/** "Your spot has gone." — an unpaid reservation the sweep released. */
export function expiryEmail(props: GameFacts, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const values = { when: when(env, props.startsAt), venue: props.venue };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(e.expiry.subject, values),
    preheader: fill(e.expiry.preheader, values),
    eyebrow: e.expiry.eyebrow,
    headline: e.expiry.headline,
    lede: fill(e.expiry.lede, values),
    rows: [whenRow(env, props), whereRow(env, props)],
    cta: { href: `${env.baseUrl}/games`, label: e.common.findAnother },
    smallPrint: plainSmallPrint(env),
    footer: e.common.footerBooked,
  });
}

export interface ReminderEmailProps extends GameFacts {
  /** The player plus guests, when known. */
  places?: number;
}

/**
 * "See you tomorrow" — the afternoon sweep, to everyone holding a place on a
 * game within `policy.reminder.hoursBeforeStart`. It restates the cancel rule
 * because this is the email somebody reads when they realise they cannot go.
 */
export function reminderEmail(props: ReminderEmailProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const values = {
    when: when(env, props.startsAt),
    time: formatTime(props.startsAt, env.locale),
    venue: props.venue,
  };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(e.reminder.subject, values),
    preheader: fill(e.reminder.preheader, values),
    eyebrow: e.reminder.eyebrow,
    headline: e.reminder.headline,
    lede: fill(e.reminder.lede, values),
    rows: [
      whenRow(env, props),
      whereRow(env, props),
      ...(props.places ? [playersRow(env, props.places)] : []),
    ],
    cta: { href: props.gameUrl, label: e.common.seeLineup },
    rule: cancelRule(env),
    smallPrint: plainSmallPrint(env),
    footer: e.common.footerBooked,
  });
}
