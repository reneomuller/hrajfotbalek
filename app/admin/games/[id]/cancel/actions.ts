"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { appCapabilities } from "@/lib/db/capabilities";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { collectCancelledRecipients } from "@/lib/email/cancelFanOut";
import { fanOutGameCancelled } from "@/lib/email/dispatch";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { siteUrl } from "@/lib/site";

export interface CancelGameState {
  status: "idle" | "cancelled" | "error";
  code?: BookingErrorCode;
  /** Counts surfaced back to the admin who pulled the trigger. */
  bookingsCancelled?: number;
  creditsIssued?: number;
  waitlistCleared?: number;
  noticesSent?: number;
  receiptsSent?: number;
}

/**
 * Cancel a game: transactional state change, then the email fan-out.
 *
 * AUTHORIZATION IS AT THE SURFACE AND INSIDE THE FUNCTION, in that order.
 * `requireAdmin()` identifies the human from their session, and the RPC is then
 * invoked ON THAT SESSION's client — not the service-role client. `cancel_game`
 * accepts an admin `auth.uid()` or a service-role context, so calling it with
 * the service-role key would satisfy its check no matter who triggered the
 * route, reducing the whole gate to "did they know the URL". The service-role
 * client appears below only for READS the admin's own RLS cannot serve
 * (other players' emails for the fan-out), never for the state change.
 */
export async function cancelGameAction(
  _prevState: CancelGameState,
  formData: FormData,
): Promise<CancelGameState> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };

  // Surface gate: redirects a non-admin before anything is read or written.
  await requireAdmin();

  /*
   * THE REASON (round 16, item 19), and it is required — but only where the
   * database can record one.
   *
   * `cancel_game_with_reason` arrives with the round-16 migration and this
   * code ships first, so the form does not ask for a reason until
   * `app_capabilities()` says it can be stored. Requiring one here regardless
   * would make cancellation impossible in that gap; asking for one and
   * dropping it would be worse.
   */
  const capabilities = await appCapabilities();
  const reason = String(formData.get("reason") ?? "").trim();

  if (capabilities.cancelWithReason && reason === "") {
    return { status: "error", code: "REASON_REQUIRED" };
  }

  const service = createServiceRoleSupabaseClient();

  // Snapshot the waitlist depth BEFORE the RPC clears it — afterwards there is
  // nothing left to count, and the admin needs to know how many people were
  // waiting on a game that is now off.
  const { count: waitlistBefore } = await service
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  const supabase = await createServerSupabaseClient();

  /*
   * TWO ENTRY POINTS, ONE LOOP. `cancel_game_with_reason` delegates to
   * `cancel_game` — every credit rule, every event and the waitlist clear stay
   * in one place — and adds the reason to the event it just wrote plus the
   * broadcast notification. The one-argument form is what a pre-migration
   * database has, and it is exactly the behaviour this action had yesterday.
   */
  const { data: cancelledCount, error } = capabilities.cancelWithReason
    ? await supabase.rpc("cancel_game_with_reason", {
        p_game_id: gameId,
        p_reason: reason,
      })
    : await supabase.rpc("cancel_game", { p_game_id: gameId });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  // --- fan-out --------------------------------------------------------------
  // Driven by the events `cancel_game` just wrote, so the recipient set is
  // exactly who the transaction touched rather than a second guess at it.
  const { data: game } = await service
    .from("games")
    .select("id, venue, starts_at")
    .eq("id", gameId)
    .maybeSingle();

  // Assembled by `collectCancelledRecipients` — shared with the dry-run
  // harness, so the evidence at the gate exercises this exact code rather than
  // a second implementation of it.
  const recipients = await collectCancelledRecipients(service, gameId);

  const base = await siteUrl();
  const summary = await fanOutGameCancelled({
    gameId,
    venue: game?.venue ?? "",
    startsAt: game?.starts_at ?? new Date().toISOString(),
    gameUrl: `${base}/games`,
    accountUrl: `${base}/account`,
    recipients,
    /*
     * THE PER-PLAYER HALF OF ITEM 19. The bell's store is a broadcast with no
     * recipient column (row 89), so "tell everyone who was booked" cannot be
     * addressed there — the notification names the game publicly and the EMAIL
     * is what reaches the people it happened to. This is the existing mail
     * path with one more field on it.
     */
    reason: reason || null,
  });

  revalidatePath(`/game/${gameId}`);
  revalidatePath("/games");

  return {
    status: "cancelled",
    bookingsCancelled: Number(cancelledCount ?? 0),
    creditsIssued: recipients.filter((r) => r.creditCzk > 0).length,
    waitlistCleared: waitlistBefore ?? 0,
    noticesSent: summary.notices,
    receiptsSent: summary.receipts,
  };
}
