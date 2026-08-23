"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { buildResumeUrl } from "@/lib/booking/resume";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { ClientPaymentMethod } from "@/lib/types/database";

export interface WaitlistActionState {
  status: "idle" | "joined" | "already" | "left" | "error";
  code?: BookingErrorCode;
}

interface WaitlistJoinResult {
  id: string;
  already_joined: boolean;
}

/**
 * Join the waitlist on a full game.
 *
 * The write is `supabase.rpc("join_waitlist", …)` and never a direct
 * `.insert()` on `waitlist` — the row and its `waitlist_joined` event have to
 * land in one transaction, which only the function can guarantee.
 *
 * Same no-pre-auth-hold rule as booking: an unauthenticated tap is sent to
 * authenticate and resumes afterwards. A waitlist row is not a hold on
 * anything, but the identity still has to be real before one is written.
 */
export async function joinWaitlistAction(
  _prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };

  const user = await getSessionUser();
  if (!user) {
    const resume = buildResumeUrl(gameId, "join_waitlist");
    redirect(`/login?next=${encodeURIComponent(resume)}`);
  }

  const outcome = await runJoinWaitlist(gameId);
  revalidatePath(`/game/${gameId}`);
  return outcome;
}

/** The RPC call, shared by the interactive form and the post-auth resume. */
export async function runJoinWaitlist(gameId: string): Promise<WaitlistActionState> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("join_waitlist", { p_game_id: gameId });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  const result = data as unknown as WaitlistJoinResult | null;
  return { status: result?.already_joined ? "already" : "joined" };
}

/**
 * Convert a waitlist row into a booking.
 *
 * Goes through `create_booking(from_waitlist_id)` — the same function every
 * other booking uses — so the capacity check, the credit application and the
 * advisory-lock ordering are identical to a normal booking. The conversion is
 * therefore race-safe by construction: when several notified players convert
 * at once, the transactional capacity check picks the winner and everyone else
 * gets CAPACITY_FULL.
 */
export async function convertWaitlistAction(
  _prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const rawMethod = formData.get("method");
  const method: ClientPaymentMethod | null =
    rawMethod === "qr" || rawMethod === "cash" ? rawMethod : null;

  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };
  if (!method) return { status: "error", code: "INSUFFICIENT_PERMISSION" };

  const user = await getSessionUser();
  if (!user) {
    const resume = buildResumeUrl(gameId, "join_waitlist");
    redirect(`/login?next=${encodeURIComponent(resume)}`);
  }

  const supabase = await createServerSupabaseClient();

  // Own-row RLS restricts this to the caller's waitlist entry, so no
  // player filter is needed for safety — the id cannot be someone else's.
  const { data: row } = await supabase
    .from("waitlist")
    .select("id")
    .eq("game_id", gameId)
    .is("converted_booking_id", null)
    .maybeSingle();

  if (!row) return { status: "error", code: "BOOKING_NOT_FOUND" };

  const { data, error } = await supabase.rpc("create_booking", {
    p_game_id: gameId,
    p_payment_method: method,
    p_from_waitlist_id: row.id,
  });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  const booking = data as unknown as { id: string } | null;
  if (!booking?.id) return { status: "error", code: "UNKNOWN" };

  redirect(`/game/${gameId}/book/confirmation?booking=${booking.id}`);
}


/**
 * Leave a waitlist you joined (round 16, item 11).
 *
 * THE MISSING HALF OF A DOOR THAT ONLY OPENED. A player could join a queue and
 * had no way off it — so the only exits were converting a spot they no longer
 * wanted, or ignoring the email when it came. The second is the one that
 * actually happened, and under notify-all FCFS an ignored notification is a
 * spot that sits open while somebody further down never hears about it.
 *
 * THROUGH `leave_waitlist`, never a `.delete()`. `authenticated` holds no
 * DELETE on `waitlist` and is not getting one: the row and its `waitlist_left`
 * event have to land together, and a grant would be the only write path in
 * this product with no event behind it.
 *
 * A SECOND TAP IS NOT AN ERROR. The RPC returns false when there was nothing
 * to remove, and that maps to the same `left` state as a successful removal —
 * both mean "you are not on this list", which is the only thing the player
 * asked to be true.
 */
export async function leaveWaitlistAction(
  _prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };

  const user = await getSessionUser();
  if (!user) return { status: "error", code: "INSUFFICIENT_PERMISSION" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_game_id: gameId });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  revalidatePath(`/game/${gameId}`);
  revalidatePath("/account");
  return { status: "left" };
}
