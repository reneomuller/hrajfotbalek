import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLocaleToRecord } from "@/lib/email/recipientLocale";
import type { Locale } from "@/lib/i18n/locales";

/**
 * What happens immediately after a credential is accepted — for BOTH ways in.
 *
 * There are two: the magic-link callback (`app/auth/callback/route.ts`) and the
 * six-digit code (`app/login/actions.ts`). They differ only in how the session
 * is established; everything after that — record the funnel completion, claim
 * a shadow identity, work out where the person was going — is identical, and
 * identical logic in two files is logic that drifts. The one that drifts is
 * always the less-used path, which here would be the code entry, which exists
 * precisely because it is the path that works when the other one does not.
 */

/** Whether the authenticated user already has a player row. */
export interface PostAuthResult {
  hasPlayer: boolean;
}

export async function completePostAuth(
  // The typed Database generic is not needed here: this calls two RPCs by name
  // and nothing else, and threading it would drag the schema type into a file
  // that has no opinion about the schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  /**
   * The language the site is showing (round 41). An account with no email
   * language yet gets this one, so a player who signed up before the choice
   * existed is written to in their browser's language from the next sign-in.
   */
  siteLocale?: Locale,
): Promise<PostAuthResult> {
  if (siteLocale) await rememberEmailLocale(supabase, siteLocale);

  // `record_auth_completed` returns whether a player row already exists. It is
  // the denominator half of the magic-link drop-off funnel Phase 26 reports on
  // — and it must be recorded for the code path too, or switching people onto
  // the code would show up as a collapse in the completion rate.
  const { data: hadPlayerRow, error: eventError } = await supabase.rpc(
    "record_auth_completed",
  );
  if (eventError) {
    // A metric write must never break a working login.
    console.error("record_auth_completed failed", eventError.message);
  }

  /*
   * ~~`claimShadowPlayer(supabase)` — on first sign-in, adopt any shadow row
   * whose email matches, so the WhatsApp-era history follows the person onto
   * their new account.~~ REMOVED (round 13, item 26).
   *
   * The flow that MADE shadow players went in round 11: an admin holds
   * anonymous guest seats now, and a guest is a seat rather than an identity.
   * So nothing has created a claimable row for two rounds, and this ran on
   * every single sign-in to adopt a population that stopped growing.
   *
   * WHAT IT MEANS FOR THE ROWS THAT ALREADY EXIST, stated plainly because it
   * is a real loss: a pre-round-11 shadow with an email will no longer be
   * adopted automatically when that person signs up. Their history does not
   * vanish — it is still on the shadow row, still rendering in every lineup
   * they were in — but it no longer merges into the new account by itself.
   * `merge_players` survives, unreferenced, as the repair for exactly that
   * case, and the ledger says so.
   */
  return { hasPlayer: hadPlayerRow === true };
}

/**
 * Where the person was heading before authentication interrupted them.
 *
 * Pure, so both callers resolve the destination identically and it can be
 * asserted without a session.
 */
export function resumeDestination({
  next,
  gameId,
  action,
}: {
  next?: string | null;
  gameId?: string | null;
  action?: string | null;
}): string {
  if (next) return next;
  if (!gameId) return "/games";
  return action === "join_waitlist"
    ? `/game/${gameId}?resume=join_waitlist`
    : `/game/${gameId}/book?resume=book`;
}

/**
 * The final destination, accounting for a session that has no player row yet.
 *
 * Someone who has authenticated but not chosen a nickname holds a session and
 * no player row. Sending them anywhere that requires one would bounce them
 * straight back, so /signup is the only correct destination — carrying the
 * intent so they land where they were going once the nickname exists.
 */
export function destinationAfterAuth({
  hasPlayer,
  resume,
}: {
  hasPlayer: boolean;
  resume: string;
}): string {
  if (hasPlayer) return resume;
  return `/signup?next=${encodeURIComponent(resume)}`;
}

/** Best-effort: a sign-in never fails because a preference could not be saved. */
async function rememberEmailLocale(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  siteLocale: Locale,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const locale = emailLocaleToRecord(data.user.user_metadata, siteLocale);
    if (!locale) return;
    const { error } = await supabase.auth.updateUser({ data: { email_locale: locale } });
    if (error) console.error("remembering the email language failed", error.message);
  } catch (error) {
    console.error("remembering the email language failed", error);
  }
}
