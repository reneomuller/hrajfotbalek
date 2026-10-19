import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import { TERMS_VERSION } from "@/lib/legal";
import { signupTermsWording } from "@/lib/legal/consentWording";
import type { Database, Json } from "@/lib/types/database";

type OwnKind = Database["public"]["Functions"]["record_consent"]["Args"]["p_kind"];

/**
 * Writes one consent record for the CALLER (round 40, Texty pro web 2.4).
 *
 * NEVER FATAL. It runs after the act it records has already succeeded — the
 * account exists, the booking is made, the preference is saved — and failing
 * that act because the record could not be written would punish the player
 * for our bookkeeping. A failure is logged loudly instead, so a missing
 * migration shows up in the logs on the first tick rather than in a dispute.
 */
export async function recordOwnConsent(
  supabase: SupabaseClient<Database>,
  consent: { kind: OwnKind; wording: string; locale: Locale; context?: Json },
): Promise<void> {
  const { error } = await supabase.rpc("record_consent", {
    p_kind: consent.kind,
    p_wording: consent.wording,
    p_locale: consent.locale,
    p_terms_version: TERMS_VERSION,
    p_context: consent.context ?? {},
  });
  if (error) {
    console.error("consent: could not record", { kind: consent.kind, message: error.message });
  }
}

/** What sign-up ticks: the terms box always, the newsletter when chosen. */
export async function recordSignupConsents(
  supabase: SupabaseClient<Database>,
  { locale, marketingOptIn }: { locale: Locale; marketingOptIn: boolean },
): Promise<void> {
  const t = resolveStrings(locale);
  await recordOwnConsent(supabase, {
    kind: "terms",
    wording: signupTermsWording(t),
    locale,
    context: { surface: "signup" },
  });
  if (!marketingOptIn) return;
  await recordOwnConsent(supabase, {
    kind: "marketing_opt_in",
    wording: t.auth.marketingLabel,
    locale,
    context: { surface: "signup" },
  });
}
