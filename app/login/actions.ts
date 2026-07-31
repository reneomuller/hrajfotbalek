"use server";

import { redirect } from "next/navigation";
import {
  completePostAuth,
  destinationAfterAuth,
  resumeDestination,
} from "@/lib/auth/postAuth";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { siteOrigin } from "@/lib/auth/origin";
import { getStrings } from "@/lib/i18n/server";

export type PendingAction = "book" | "join_waitlist" | "login";

export interface LoginFormState {
  status: "idle" | "sent" | "error";
  message?: string;
  /**
   * The address the code was sent to, echoed back so the second step can
   * verify against it.
   *
   * `verifyOtp` needs the email as well as the token — the code alone does not
   * identify anyone. Carrying it in the form state means the code step needs
   * no session, no server-side pending-login store and no second round trip:
   * the page already knows who asked.
   */
  email?: string;
}

/**
 * Very deliberately loose. Real validation is "did the link arrive", which no
 * regex can answer; this only catches obvious typos before we spend a send.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function requestMagicLink(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = await getStrings();
  const email = String(formData.get("email") ?? "").trim();
  const gameId = (formData.get("gameId") as string | null) || null;
  const rawAction = (formData.get("action") as string | null) || "login";
  const action: PendingAction =
    rawAction === "book" || rawAction === "join_waitlist" ? rawAction : "login";
  const next = (formData.get("next") as string | null) || null;

  if (!looksLikeEmail(email)) {
    return { status: "error", message: t.auth.emailInvalid };
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
    return { status: "error", message: t.auth.linkSendFailed };
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

  return { status: "sent", message: t.auth.linkSent, email };
}

/**
 * The six-digit code path.
 *
 * SAME EMAIL, SECOND WAY IN. `signInWithOtp` above sends one message that
 * carries both a link and a code (once the Supabase template emits
 * `{{ .Token }}`); this verifies the code. Nothing extra is sent and no second
 * flow is started — which is why the code is offered alongside the link rather
 * than instead of it.
 *
 * WHY IT EXISTS: the link carries a PKCE credential whose verifier lives in a
 * cookie written when the link was requested. WhatsApp, Instagram and several
 * Android mail apps open links in an embedded browser with a separate cookie
 * jar, so the verifier is simply not sent and the exchange dies with "code
 * verifier not found in storage" — on a link that looks completely normal, for
 * a user who did nothing wrong. The share links for this product travel
 * through WhatsApp, so that is not an edge case here; it is the main road.
 * `verifyOtp` is stateless and has no such dependency: the tab that asked for
 * the code is the tab that receives the session.
 *
 * `token_hash` in the callback route solves the same problem for the link; this
 * solves it for the person who cannot open the link at all.
 */
export async function verifyEmailOtp(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = await getStrings();
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "")
    // People paste "123 456" and "123-456" out of a mail client.
    .replace(/[\s-]/g, "");
  const gameId = (formData.get("gameId") as string | null) || null;
  const rawAction = (formData.get("action") as string | null) || "login";
  const action: PendingAction =
    rawAction === "book" || rawAction === "join_waitlist" ? rawAction : "login";
  const next = (formData.get("next") as string | null) || null;

  if (!looksLikeEmail(email)) {
    return { status: "error", message: t.auth.emailInvalid };
  }
  if (!/^\d{6}$/.test(token)) {
    return { status: "error", message: t.auth.otpMalformed, email };
  }

  const supabase = await createServerSupabaseClient();

  // `type: "email"` covers both a first sign-in and a returning one — Supabase
  // issues the same shape for a magic-link OTP either way.
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    // A wrong code and an expired code are the same message on purpose: the
    // distinction tells an attacker which half they got right, and tells a
    // real user nothing they can act on differently.
    console.error("verifyOtp failed", error.message);
    return { status: "error", message: t.auth.otpInvalid, email };
  }

  const { hasPlayer } = await completePostAuth(supabase);
  const resume = resumeDestination({ next, gameId, action });

  // Outside the try/catch shape above deliberately: `redirect()` works by
  // throwing, so it must not sit anywhere that swallows exceptions.
  redirect(destinationAfterAuth({ hasPlayer, resume }));
}
