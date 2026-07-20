import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { claimShadowPlayer } from "@/lib/auth/shadowClaim";

/**
 * Magic-link callback.
 *
 * Establishes the session, records `auth_completed`, and attempts the shadow
 * claim. The `auth_link_sent` -> `auth_completed` pair is the magic-link
 * drop-off funnel Phase 26 reports on.
 *
 * Routing afterwards:
 *   - claimed or already-linked  -> the pending intent (or /games)
 *   - no player row              -> /signup, carrying the intent forward
 *
 * A user who has authenticated but not yet chosen a nickname holds a session
 * and no player row. Sending them anywhere that requires a player row would
 * bounce them straight back here, so /signup is the only correct destination.
 *
 * TWO CREDENTIAL SHAPES, deliberately both supported:
 *
 *   `code`       PKCE. Requires the code-verifier cookie written when the link
 *                was requested, so it only works if the link is opened in the
 *                SAME browser that asked for it. On a phone that assumption
 *                breaks routinely — mail apps open links in their own embedded
 *                browser, which has its own cookie jar.
 *   `token_hash` Stateless verification. Survives being opened anywhere, which
 *                is what makes it the reliable shape for email on mobile.
 *                Requires the Supabase email template to emit `{{ .TokenHash }}`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const gameId = url.searchParams.get("game");
  const action = url.searchParams.get("action") ?? "login";
  const next = url.searchParams.get("next");

  /*
   * A failed exchange goes to /auth/error, NOT to /login.
   *
   * Redirecting a broken link to /login renders a page identical to the one a
   * signed-out visitor sees, so the failure is invisible: /login never read the
   * `?error=` it was handed. That is what made this bug survive several rounds
   * of diagnosis — no error on screen, and (before this route logged anything)
   * no error in the dev log either.
   */
  const failed = (reason: string, detail?: string) => {
    console.error("magic-link verification failed", reason, detail ?? "");
    const target = new URL("/auth/error", url.origin);
    target.searchParams.set("reason", reason);
    if (detail) target.searchParams.set("detail", detail);
    return NextResponse.redirect(target);
  };

  if (!code && !tokenHash) {
    // Reaching the callback with no credential at all usually means the link
    // carried its token in the URL fragment, which never reaches the server.
    return failed("missing_code", "no code or token_hash on the callback URL");
  }

  const supabase = await createServerSupabaseClient();

  const { error: exchangeError } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (exchangeError) {
    return failed("invalid_code", exchangeError.message);
  }

  // `record_auth_completed` returns whether a player row already exists.
  const { data: hadPlayerRow, error: eventError } = await supabase.rpc("record_auth_completed");
  if (eventError) {
    // A metric write must never break a working login.
    console.error("record_auth_completed failed", eventError.message);
  }

  let playerId: string | null = null;
  try {
    playerId = await claimShadowPlayer(supabase);
  } catch (error) {
    console.error("claim_shadow_player failed", (error as Error).message);
  }

  const hasPlayer = playerId !== null || hadPlayerRow === true;

  // Where the user was heading before authentication interrupted them.
  const resume = next
    ? next
    : gameId
      ? action === "join_waitlist"
        ? `/game/${gameId}?resume=join_waitlist`
        : `/game/${gameId}/book?resume=book`
      : "/games";

  if (!hasPlayer) {
    const signup = new URL("/signup", url.origin);
    signup.searchParams.set("next", resume);
    return NextResponse.redirect(signup);
  }

  return NextResponse.redirect(new URL(resume, url.origin));
}
