import { policy } from "@/lib/policy";
import { renderEmail, type EmailRow, type RenderedEmail } from "./layout";
import {
  credits,
  fill,
  plainSmallPrint,
  when,
  whenRow,
  whereRow,
  type EmailEnv,
  type GameFacts,
} from "./parts";

/**
 * Why nothing came back, when nothing did — the old copy had one sentence for
 * both, "nothing had been paid", which round 40's "I can't make it" made wrong:
 * a late cancellation of a PAID place returns nothing because of the rule, not
 * because nothing was paid.
 */
export type CancelOutcome = "credited" | "late" | "unpaid";

export interface CancellationEmailProps extends GameFacts {
  /** Credits this cancellation returned. Zero for a late or unpaid one. */
  creditsReturned: number;
  outcome: CancelOutcome;
}

function returnedRow(env: EmailEnv, count: number): EmailRow[] {
  return count > 0 ? [{ label: env.t.emails.common.returned, value: credits(env, count) }] : [];
}

/** The player cancelled their own place. */
export function cancellationCreditEmail(
  props: CancellationEmailProps,
  env: EmailEnv,
): RenderedEmail {
  const e = env.t.emails;
  const copy = e.cancellationCredit;
  const values = {
    when: when(env, props.startsAt),
    venue: props.venue,
    credits: credits(env, props.creditsReturned),
    hours: env.cutoffHours,
  };
  const lede =
    props.outcome === "credited"
      ? copy.ledeCredit
      : props.outcome === "late"
        ? copy.ledeLate
        : copy.ledeUnpaid;

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(copy.subject, values),
    preheader: fill(props.outcome === "credited" ? copy.preheaderCredit : copy.preheaderNone, values),
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    lede: fill(lede, values),
    rows: [whenRow(env, props), whereRow(env, props), ...returnedRow(env, props.creditsReturned)],
    cta: { href: `${env.baseUrl}/games`, label: e.common.findAnother },
    smallPrint: plainSmallPrint(env),
    footer: copy.footer,
  });
}

export interface GameCancelledProps extends GameFacts {
  creditsReturned: number;
  /**
   * The organizer's own words for why (round 16, item 19). Optional, and
   * absent is a real state: a game cancelled before reasons existed has none,
   * and inventing one would be worse than the silence.
   */
  reason?: string | null;
}

/**
 * The game is off. THE REASON SITS RIGHT UNDER THE HEADLINE, set apart as a
 * quote — it is what the reader opened the email to find out. Obchodní
 * podmínky 11.3: what was paid comes back as Credit with seven extra days.
 */
export function gameCancelledEmail(props: GameCancelledProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const copy = e.gameCancelled;
  const values = {
    when: when(env, props.startsAt),
    venue: props.venue,
    credits: credits(env, props.creditsReturned),
    extensionDays: policy.credits.cancelledGameExtensionDays,
  };
  const credited = props.creditsReturned > 0;

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(copy.subject, values),
    preheader: fill(credited ? copy.preheaderCredit : copy.preheaderNone, values),
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    lede: `${fill(copy.lede, values)} ${fill(credited ? copy.creditLine : copy.noCreditLine, values)}`,
    quote: props.reason?.trim() || null,
    rows: [whenRow(env, props), whereRow(env, props), ...returnedRow(env, props.creditsReturned)],
    cta: { href: `${env.baseUrl}/games`, label: e.common.findAnother },
    smallPrint: plainSmallPrint(env),
    footer: copy.footer,
  });
}
