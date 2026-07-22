"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
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

  const service = createServiceRoleSupabaseClient();

  // Snapshot the waitlist depth BEFORE the RPC clears it — afterwards there is
  // nothing left to count, and the admin needs to know how many people were
  // waiting on a game that is now off.
  const { count: waitlistBefore } = await service
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  const supabase = await createServerSupabaseClient();
  const { data: cancelledCount, error } = await supabase.rpc("cancel_game", {
    p_game_id: gameId,
  });

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
