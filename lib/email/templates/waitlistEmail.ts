import { renderEmail, type RenderedEmail } from "./layout";
import {
  fill,
  plainSmallPrint,
  when,
  whenRow,
  whereRow,
  type EmailEnv,
  type GameFacts,
} from "./parts";

export interface WaitlistSpotOpenProps extends GameFacts {
  /** Straight to the claim, not to the game page. */
  convertUrl: string;
}

/**
 * "A spot just opened." Notify-all, first come first served: everyone on the
 * waitlist gets this at once and `create_booking`'s capacity check settles the
 * race — so the copy says so rather than implying the spot is reserved.
 */
export function waitlistSpotOpenEmail(props: WaitlistSpotOpenProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const values = { when: when(env, props.startsAt), venue: props.venue };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(e.waitlistSpotOpen.subject, values),
    preheader: fill(e.waitlistSpotOpen.preheader, values),
    eyebrow: e.waitlistSpotOpen.eyebrow,
    headline: e.waitlistSpotOpen.headline,
    lede: fill(e.waitlistSpotOpen.lede, values),
    rows: [whenRow(env, props), whereRow(env, props)],
    cta: { href: props.convertUrl, label: e.waitlistSpotOpen.cta },
    smallPrint: plainSmallPrint(env),
    footer: e.waitlistSpotOpen.footer,
  });
}
