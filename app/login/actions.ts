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

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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
