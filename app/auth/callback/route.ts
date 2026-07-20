import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { claimShadowPlayer } from "@/lib/auth/shadowClaim";

/**
 * Magic-link callback.
 *
 * Exchanges the code for a session, records `auth_completed`, and attempts the
 * shadow claim. The `auth_link_sent` -> `auth_completed` pair is the
 * magic-link drop-off funnel Phase 26 reports on.
 *
 * Routing afterwards:
 *   - claimed or already-linked  -> the pending intent (or /games)
 *   - no player row              -> /signup, carrying the intent forward
 *
 * A user who has authenticated but not yet chosen a nickname holds a session
 * and no player row. Sending them anywhere that requires a player row would
 * bounce them straight back here, so /signup is the only correct destination.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const gameId = url.searchParams.get("game");
  const action = url.searchParams.get("action") ?? "login";
  const next = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createServerSupabaseClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=invalid_code", url.origin));
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
