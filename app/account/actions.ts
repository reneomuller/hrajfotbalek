"use server";

import { revalidatePath } from "next/cache";
import { withToast } from "@/lib/ux/toast";
import { redirect } from "next/navigation";
import { notifyWaitlistForGame } from "@/lib/cron/waitlistRelease";
import { bookingEmailContext } from "@/lib/cron/context";
import { dispatchEmail } from "@/lib/email/dispatch";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { getSessionUser } from "@/lib/auth/session";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { getStrings } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/auth/origin";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/signupProfile";

/**
 * Sign out.
 *
 * `signOut()` on the server client clears the session cookies through the
 * cookie adapter, so the browser is genuinely logged out rather than merely
 * navigated away — a client-side redirect would leave the session intact and
 * the next visit would silently be authenticated again.
 *
 * Scope is local: it ends this browser's session, not every session the player
 * holds. Signing a player out of their other devices is a security action they
 * did not ask for here.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

export interface CancelActionState {
  status: "idle" | "cancelled" | "error";
  code?: BookingErrorCode;
}

/**
 * Self-cancel.
 *
 * The write goes through `cancel_booking`, which owns the whole decision:
 * ownership, the cancellation window, and how much credit to issue for money
 * actually applied. Nothing about that is re-implemented here.
 *
 * The UI disables the cancel affordance after kickoff for a decent experience,
 * but that is a MIRROR of the rule, not the rule. A UI that merely hides the
 * button while the RPC would still accept the call is a security defect rather
 * than a cosmetic one — so this action always calls the RPC and always renders
 * whatever it decides, including a `CANCEL_WINDOW_CLOSED` refusal for a
 * request that reached here anyway.
 */
export async function cancelBookingAction(
  _prevState: CancelActionState,
  formData: FormData,
): Promise<CancelActionState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { status: "error", code: "BOOKING_NOT_FOUND" };

  const user = await getSessionUser();
  if (!user) return { status: "error", code: "INSUFFICIENT_PERMISSION" };

  const supabase = await createServerSupabaseClient();

  // Read the game before cancelling: afterwards the booking still carries the
  // id, but reading it first keeps the release step independent of whatever
  // the RPC returns.
  const { data: booking } = await supabase
    .from("bookings")
    .select("game_id")
    .eq("id", bookingId)
    .maybeSingle();

  const { data: cancelResult, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  // Credit receipt. The amount comes from the RPC's own return value rather
  // than being recomputed here — the function decides how much a cancellation
  // is worth, and a second opinion in TypeScript is a second answer waiting to
  // disagree.
  const credited = Number(
    (cancelResult as unknown as { credit_issued_czk?: number } | null)
      ?.credit_issued_czk ?? 0,
  );
  await dispatchCancellationEmail(bookingId, credited);

  // A cancellation releases a spot, and `cancel_booking` emits `spot_released`
  // to say so. Notifying here rather than waiting for the next cron tick is
  // what makes the loop hands-free: cancel -> credit -> release -> notify ->
  // convert, with no human and no 15-minute wait in the middle.
  //
  // Failure to mail must never fail the cancellation — the money movement is
  // already committed, and the waitlist is re-notified on the next release.
  if (booking?.game_id) {
    try {
      await notifyWaitlistForGame(booking.game_id);
    } catch (notifyError) {
      console.error("waitlist notify after cancellation failed", notifyError);
    }
  }

  // The issued credit must show up in the balance immediately — the ledger is
  // the authority and the page recomputes it server-side on the next render.
  revalidatePath("/account");
  if (booking?.game_id) revalidatePath(`/game/${booking.game_id}`);

  /*
   * THE TOAST TRAVELS BY REDIRECT, not by the returned state (§8, REQ-UX-002).
   *
   * CLAUDE.md records the reason directly: a marker rendered from a
   * `useActionState` result can be unmounted by the re-render `revalidatePath`
   * triggers, before anyone — or any assertion — observes it. A redirect
   * carrying `?toast=` is rendered by the SERVER on the next request, so it
   * survives.
   *
   * `toastTo` is optional and the returned state is unchanged without it, so
   * the two call sites opt in and nothing that predates them has to move.
   */
  const toastTo = String(formData.get("toastTo") ?? "");
  if (toastTo.startsWith("/")) {
    redirect(withToast(toastTo, "bookingCancelled"));
  }

  return { status: "cancelled" };
}

/**
 * Cancellation + credit receipt.
 *
 * Sent after the transition has committed, and never able to fail it: the
 * money has already moved into the wallet, and a mail problem must not make a
 * successful cancellation look like a failed one to the player.
 */
async function dispatchCancellationEmail(
  bookingId: string,
  creditCzk: number,
): Promise<void> {
  try {
    const service = createServiceRoleSupabaseClient();

    const { data: booking } = await service
      .from("bookings")
      .select("id, game_id, player_id, price_czk, credit_applied_czk")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return;

    const [{ data: game }, { data: player }] = await Promise.all([
      service.from("games").select("id, venue, starts_at").eq("id", booking.game_id).maybeSingle(),
      service.from("players").select("email, nickname").eq("id", booking.player_id).maybeSingle(),
    ]);
    if (!game || !player) return;

    const context = await bookingEmailContext(booking, game, player);
    await dispatchEmail({
      event: "booking_cancelled",
      to: player.email,
      context: { ...context, creditCzk },
    });
  } catch (error) {
    console.error("cancellation email dispatch failed", error);
  }
}

/* ---------------------------------------------------------------------------
 * Sign-in and security
 * ------------------------------------------------------------------------ */

export interface SecurityActionState {
  status: "idle" | "done" | "error";
  message?: string;
}

/**
 * Change password, with the current one required.
 *
 * WHY RE-AUTHENTICATE AT ALL. `updateUser({ password })` needs only a session,
 * so without this check an unattended phone is a permanent account takeover:
 * whoever picks it up sets a new password, and the owner is locked out of their
 * own bookings and wallet. Asking for the current password costs one field and
 * closes that.
 *
 * There is no "verify this password" endpoint, so the check is a sign-in with
 * the address already on the session. It issues a fresh session for the same
 * user, which is harmless — and it is the only way to be sure the person typing
 * is the person who set the password rather than the person holding the phone.
 *
 * A player who never set a password cannot pass this and should not: the
 * message points them at the emailed code, which is the path that identifies
 * them by their inbox instead.
 */
export async function changePasswordAction(
  _prevState: SecurityActionState,
  formData: FormData,
): Promise<SecurityActionState> {
  const t = await getStrings();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");

  if (next.length < PASSWORD_MIN_LENGTH) {
    return { status: "error", message: t.auth.passwordTooShort };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) redirect("/login");

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: current,
  });
  if (reauthError) {
    return { status: "error", message: t.account.currentPasswordWrong };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("updateUser(password) failed", error.message);
    return { status: "error", message: t.auth.setPasswordFailed };
  }

  return { status: "done", message: t.account.changePasswordDone };
}

/**
 * Start an email change. It completes in two inboxes, not here.
 *
 * `double_confirm_changes` is on (contract §3.3, ruled 2026-07-28), so Supabase
 * mails BOTH the current address and the new one and swaps the address only
 * when both are confirmed. Nothing observable happens on this page — which is
 * exactly why the copy says two emails are coming before the button is pressed.
 *
 * The old mailbox having a veto is the point: without it, a session left open
 * anywhere becomes a permanent account transfer, and the person who owned the
 * account would learn about it from a bounce.
 */
export async function changeEmailAction(
  _prevState: SecurityActionState,
  formData: FormData,
): Promise<SecurityActionState> {
  const t = await getStrings();
  const nextEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return { status: "error", message: t.auth.emailInvalid };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const current = userData.user?.email;
  if (!current) redirect("/login");

  if (current.toLowerCase() === nextEmail) {
    return { status: "error", message: t.account.changeEmailSame };
  }

  // Both confirmation links come back through the shared callback, so the
  // session that results goes through the same post-auth path as every other
  // way in rather than a bespoke one.
  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: new URL("/auth/callback", await siteOrigin()).toString() },
  );

  if (error) {
    console.error("updateUser(email) failed", error.message);
    return { status: "error", message: t.account.changeEmailFailed };
  }

  return {
    status: "done",
    message: t.account.changeEmailSent
      .replace("{current}", current)
      .replace("{next}", nextEmail),
  };
}
