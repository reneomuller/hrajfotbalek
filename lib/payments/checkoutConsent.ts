import { isLocale, type Locale } from "@/lib/i18n/locales";

/**
 * The box above Pay a completed checkout carries (round 40, Texty 2.4), read
 * off the signed `checkout.session.completed` event — the withdrawal waiver
 * until 2026-10-28, the terms sentence since.
 *
 * TWO WAYS IT WAS GIVEN, and both are evidence:
 *
 *   `stripe` — Stripe drew the box above Pay and records the answer on the
 *              session as `consent.terms_of_service: "accepted"`. Pay cannot be
 *              pressed without it; if the session does not say "accepted",
 *              nothing is recorded rather than something assumed.
 *   `site`   — Stripe could not draw it (no terms URL in the Dashboard) and our
 *              own box stood in front of the form, which stayed inert until it
 *              was ticked. A completed payment therefore implies the tick.
 *
 * `acceptedAt` is the event's own time — the moment the payment completed,
 * which is the moment the ticked box was submitted with it.
 *
 * A session created before round 40 carries none of this metadata and records
 * nothing: a box nobody was shown is not one to write down.
 */
export interface CheckoutConsent {
  sessionId: string;
  playerId: string;
  locale: Locale;
  termsVersion: string;
  via: "stripe" | "site";
  acceptedAt: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function parseCheckoutConsent(payload: string): CheckoutConsent | null {
  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof event !== "object" || event === null) return null;

  const record = event as Record<string, unknown>;
  if (record.type !== "checkout.session.completed") return null;

  const object = (record.data as Record<string, unknown> | undefined)?.object as
    | Record<string, unknown>
    | undefined;
  const sessionId = text(object?.id);
  const metadata = object?.metadata as Record<string, unknown> | null | undefined;
  if (!sessionId || !metadata) return null;

  const playerId = text(metadata.player_id);
  const termsVersion = text(metadata.terms_version);
  const locale = metadata.consent_locale;
  const via = metadata.consent_via;
  if (!playerId || !termsVersion || !isLocale(locale)) return null;
  if (via !== "stripe" && via !== "site") return null;

  if (via === "stripe") {
    const consent = object?.consent as Record<string, unknown> | null | undefined;
    if (consent?.terms_of_service !== "accepted") return null;
  }

  const created = typeof record.created === "number" ? record.created : null;
  return {
    sessionId,
    playerId,
    locale,
    termsVersion,
    via,
    acceptedAt: new Date(created !== null ? created * 1000 : Date.now()).toISOString(),
  };
}
