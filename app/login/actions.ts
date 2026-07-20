"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";

export type PendingAction = "book" | "join_waitlist" | "login";

export interface LoginFormState {
  status: "idle" | "sent" | "error";
  message?: string;
}

/**
 * Very deliberately loose. Real validation is "did the link arrive", which no
 * regex can answer; this only catches obvious typos before we spend a send.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * The origin the magic link comes back to.
 *
 * This MUST match the origin the browser is currently on. The PKCE code
 * verifier is stored in a cookie, and cookies are scoped to a host — so if the
 * link returns to a different one, the verifier is simply not sent and the
 * exchange fails with "code verifier not found in storage". `localhost`,
 * `127.0.0.1` and a LAN IP are three separate cookie jars even in one browser,
 * which is exactly how this looks like a working login that silently has no
 * session at the end of it.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const requestOrigin = `${proto}://${host}`;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!configured) return requestOrigin;

  // Loud, because the resulting failure is otherwise indistinguishable from a
  // link that simply expired.
  if (new URL(configured).host !== host) {
    console.error(
      `NEXT_PUBLIC_SITE_URL (${configured}) does not match the host this request ` +
        `arrived on (${host}). The magic link will return to a different origin ` +
        `than the one holding the PKCE code verifier cookie, and the exchange ` +
        `will fail. Browse the app on ${configured}, or unset NEXT_PUBLIC_SITE_URL.`,
    );
  }

  return configured;
}

/**
 * Requests a magic link and records `auth_link_sent`.
 *
 * The `redirectTo` payload carries the target game id and the pending action.
 * That payload is what makes Phase 11's deep-link resume possible: a player who
 * taps Book while logged out comes back to their game with the intent intact,
 * rather than landing on a bare home screen having lost their place. Getting it
 * right is cheap here and expensive to retrofit.
 *
 * The magic-link email itself is sent by Supabase's built-in sender and
 * deliberately does NOT route through `sendEmail()` / `EMAIL_DRY_RUN`. That
 * keeps login working on real phones before Resend's DNS verifies; the M5
 * cutover (Phase 30) moves it.
 */
export async function requestMagicLink(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const gameId = (formData.get("gameId") as string | null) || null;
  const rawAction = (formData.get("action") as string | null) || "login";
  const action: PendingAction =
    rawAction === "book" || rawAction === "join_waitlist" ? rawAction : "login";
  const next = (formData.get("next") as string | null) || null;

  if (!looksLikeEmail(email)) {
    return { status: "error", message: strings.auth.emailInvalid };
  }

  const supabase = await createServerSupabaseClient();

  const callback = new URL("/auth/callback", await siteOrigin());
  if (gameId) callback.searchParams.set("game", gameId);
  callback.searchParams.set("action", action);
  if (next) callback.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    return { status: "error", message: strings.auth.linkSendFailed };
  }

  // Funnel numerator. Recorded only after a successful send, so the
  // auth_link_sent -> auth_completed ratio measures delivery-and-click rather
  // than delivery failures.
  const { error: eventError } = await supabase.rpc("record_auth_link_sent", {
    p_game_id: gameId,
    p_action: action,
  });

  // A failed metric write must never break a working login.
  if (eventError) {
    console.error("record_auth_link_sent failed", eventError.message);
  }

  return { status: "sent", message: strings.auth.linkSent };
}
