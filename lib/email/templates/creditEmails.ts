import { formatDate } from "@/lib/format";
import { renderEmail, type RenderedEmail } from "./layout";
import {
  credits,
  fill,
  plainSmallPrint,
  purchaseSmallPrint,
  receipt,
  termsAttachment,
  type EmailEnv,
  type PaymentReceipt,
} from "./parts";

export interface CreditsPurchasedProps {
  /** The receipt carries the count, the price and the validity. */
  paid: PaymentReceipt;
  /** The wallet afterwards, in Credits, when known. */
  balanceCredits?: number | null;
  /**
   * A single game whose last seat went while the player was paying: the money
   * became Credits instead (`settle_checkout_session` → `credited`).
   */
  gameFull?: boolean;
}

/**
 * The receipt for a purchase of Credits (Texty pro web 5.1): what was bought,
 * for how much, until when, the box above Pay exactly as ticked — and the terms in
 * force, attached.
 *
 * ~~Written, translated, and never sent~~ (the outbound map, 2026-09-23: "it
 * appears exactly once in the whole repository: its own definition"). Round 41
 * sends it from the Stripe webhook and from the admin's transfer confirmation.
 */
export function creditsPurchasedEmail(props: CreditsPurchasedProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const copy = e.creditsPurchased;
  const values = {
    credits: credits(env, props.paid.credits),
    date: formatDate(props.paid.validUntil, env.locale),
  };

  return renderEmail({
    locale: env.locale,
    baseUrl: env.baseUrl,
    subject: fill(copy.subject, values),
    preheader: fill(copy.preheader, values),
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    lede: fill(props.gameFull ? copy.ledeGameFull : copy.lede, values),
    rows: [
      { label: e.receipt.validUntil, value: values.date },
      ...(typeof props.balanceCredits === "number"
        ? [{ label: copy.balance, value: credits(env, props.balanceCredits) }]
        : []),
    ],
    cta: { href: `${env.baseUrl}/games`, label: e.common.findGame },
    receipt: receipt(env, props.paid),
    smallPrint: purchaseSmallPrint(env),
    footer: copy.footer,
    attachments: [termsAttachment(env)],
  });
}

export interface CreditsExpiringProps {
  /** What is left in the batch — not what was bought. */
  credits: number;
  expiresAt: string;
}

/**
 * The warning before Credits lapse — a week ahead since round 40 (Obchodní
 * podmínky 5.4; it was three days). To the GAMES LIST, not the account page:
 * someone told their Credits are running out needs to book something.
 */
export function creditsExpiringEmail(props: CreditsExpiringProps, env: EmailEnv): RenderedEmail {
  const e = env.t.emails;
  const copy = e.creditsExpiring;
  const values = {
    credits: credits(env, props.credits),
    date: formatDate(props.expiresAt, env.locale),
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
      { label: copy.left, value: values.credits },
      { label: copy.expires, value: values.date },
    ],
    cta: { href: `${env.baseUrl}/games`, label: e.common.findGame },
    smallPrint: plainSmallPrint(env),
    footer: copy.footer,
  });
}
