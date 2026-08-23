"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseUnderpayment, toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";
import type { ConfirmResult } from "@/lib/types/database";

export interface ConfirmPaymentState {
  status: "idle" | "confirmed" | "underpaid" | "error";
  /** Surplus turned into wallet credit. Present on an overpayment. */
  creditIssuedCzk?: number;
  /** How far short the payment fell. Present on an underpayment. */
  shortfallCzk?: number;
  /** True when the payment landed on an already-expired booking. */
  wasExpired?: boolean;
  message?: string;
}

/**
 * One-tap ✓ Paid, and the amount-differs path behind it.
 *
 * ALL RECONCILIATION LOGIC IS IN `confirm_booking`. This action supplies an
 * amount (or omits it) and renders what comes back. It does not decide what an
 * overpayment means, does not compute credit, and does not decide whether an
 * expired booking gets its spot back — the answers are, respectively: wallet
 * credit, the RPC's arithmetic, and never.
 *
 * `received_amount_czk` is OMITTED on the one-tap path, which is what tells
 * the RPC "confirm at the expected amount". Sending the expected amount
 * explicitly would look equivalent and is not: it would make the tap a claim
 * about what the bank reported, and this tap is not that claim.
 *
 * `p_confirmed_by` carries the acting admin's player id into the
 * `payment_confirmed` event. Metadata for the audit trail, never
 * authorization — the RPC decides that from the session it runs under.
 */
export async function confirmPaymentAction(
  _prevState: ConfirmPaymentState,
  formData: FormData,
): Promise<ConfirmPaymentState> {
  const admin = await requireAdmin();

  const bookingId = String(formData.get("bookingId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!bookingId) return { status: "error", message: toAdminErrorMessage("BOOKING_NOT_FOUND") };

  // Present only on the amount-differs path.
  const rawAmount = String(formData.get("receivedAmount") ?? "").trim();
  const receivedAmount = rawAmount === "" ? null : Number(rawAmount);

  if (receivedAmount !== null && (!Number.isInteger(receivedAmount) || receivedAmount < 0)) {
    return { status: "error", message: toAdminErrorMessage("INVALID_PRICE") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_booking", {
    p_booking_id: bookingId,
    p_confirmed_by: admin.id,
    p_received_amount_czk: receivedAmount,
  });

  if (error) {
    // The RPC refuses a partial payment and rolls back, so the booking is
    // still held and unpaid. The shortfall is reported from the detail it
    // raised with rather than recomputed here, so the number the admin sees is
    // the number the function actually compared.
    const shortfall = parseUnderpayment(error.message);
    if (shortfall !== null) {
      return { status: "underpaid", shortfallCzk: shortfall };
    }
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  const result = data as unknown as ConfirmResult | null;

  if (gameId) {
    revalidatePath(`/admin/games/${gameId}`);
    revalidatePath(`/game/${gameId}`);
  }

  return {
    status: "confirmed",
    creditIssuedCzk: result?.credit_issued_czk ?? 0,
    // `expired` coming back from a confirm is the payment-after-expiry path:
    // credited in full, spot not reinstated, and the UI must not offer one.
    wasExpired: result?.status === "expired",
  };
}

/**
 * Release a player's seat from the roster (round 16, item 17).
 *
 * THE MONEY RULE IS `cancel_game`'S, AND THE CHOICE IS RECORDED IN SQL. The
 * owner asked for no new money behaviour, so this picks between the two rules
 * that exist rather than inventing a third: `cancel_booking` applies the
 * lateness forfeit because the PLAYER chose to leave, and `cancel_game`
 * credits in full because they chose nothing. An admin removal is the second
 * shape. See `admin_remove_booking`.
 *
 * THE ROUTE GUARD IS NOT THE AUTHORIZATION. `requireAdmin()` here because a
 * server action is a POST endpoint reachable without rendering an admin page,
 * and again inside the RPC, because a route guard is skipped by anyone using
 * curl.
 */
export interface RemoveBookingState {
  status: "idle" | "removed" | "error";
  message?: string;
}

export async function removeBookingAction(
  _prevState: RemoveBookingState,
  formData: FormData,
): Promise<RemoveBookingState> {
  await requireAdmin();

  const bookingId = String(formData.get("bookingId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!bookingId || !gameId) {
    return { status: "error", message: strings.admin.rosterRemoveFailed };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_remove_booking", {
    p_booking_id: bookingId,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/game/${gameId}`);
  return { status: "removed" };
}

export interface DeleteState {
  status: "idle" | "error";
  message?: string;
}

/**
 * Delete a game outright (round 16, item 18).
 *
 * IT REFUSES A GAME WITH BOOKINGS, and the refusal is in SQL rather than in
 * this action or in the dialog. A booking is what the credit ledger is keyed
 * to; deleting one quietly is how a wallet stops adding up. The route is
 * skipped by anyone using curl, so the guarantee has to live where the write
 * does.
 *
 * THE ORDER IS CANCEL, THEN DELETE. `cancel_game` credits everyone through the
 * loop that already exists; only after that is there nothing left to lose —
 * and even then a cancelled game with cancelled bookings stays, because those
 * rows are the audit trail. What deletes is a game nobody ever booked.
 *
 * IT REDIRECTS ON SUCCESS, because the page it was called from no longer
 * exists. Returning a state to a route that 404s on its next render is a
 * spinner that never resolves.
 */
export async function deleteGameAction(
  _prevState: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: strings.admin.deleteGameFailed };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_delete_game", { p_game_id: gameId });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/games");
  revalidatePath("/games");
  redirect("/admin/games");
}
