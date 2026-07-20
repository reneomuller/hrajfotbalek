"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { getSessionUser } from "@/lib/auth/session";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { buildResumeUrl } from "@/lib/booking/resume";
import type { BookingResult, ClientPaymentMethod } from "@/lib/types/database";

export interface BookingActionState {
  status: "idle" | "error";
  code?: BookingErrorCode;
}

function isClientPaymentMethod(value: unknown): value is ClientPaymentMethod {
  return value === "qr" || value === "cash";
}

/**
 * Creates a booking.
 *
 * TWO RULES GOVERN THIS FILE:
 *
 *  1. The write goes through `supabase.rpc('create_booking', ...)` on the
 *     server client carrying the user's session cookie, so `auth.uid()` inside
 *     the function identifies the acting player. There is no direct table
 *     write here and there must never be one — capacity, credit application
 *     and the waitlist conversion are decided under advisory locks inside the
 *     function, and a client-assembled transition cannot reproduce that.
 *
 *  2. Only `qr` | `cash` are ever sent. `credit` and `seed_free` are OUTCOMES
 *     the function derives; the RPC rejects them outright from a client. The
 *     UI therefore never predicts the outcome — it reads `payment_method` back
 *     off the result. A locally-held credit balance may be stale, and the
 *     function's answer is the only authoritative one.
 */
export async function createBookingAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const rawMethod = formData.get("method");

  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };
  if (!isClientPaymentMethod(rawMethod)) {
    // Reaching here means the form was tampered with — the UI only ever offers
    // the two values. Refuse rather than defaulting to one.
    return { status: "error", code: "INSUFFICIENT_PERMISSION" };
  }

  // No pre-auth soft hold: an unauthenticated caller is sent to authenticate
  // and the booking is attempted only afterwards. Nothing is reserved here.
  const user = await getSessionUser();
  if (!user) {
    const resume = buildResumeUrl(gameId, "book", rawMethod);
    redirect(`/login?next=${encodeURIComponent(resume)}`);
  }

  const bookingId = await runCreateBooking(gameId, rawMethod);
  if (typeof bookingId !== "string") return bookingId;

  redirect(`/game/${gameId}/book/confirmation?booking=${bookingId}`);
}

/**
 * The RPC call itself, shared by the interactive form and the post-auth
 * resume path. Returns the new booking id, or an error state.
 *
 * Both paths must go through here: verifying one without the other proves
 * nothing, since the resume path is exactly where a second, divergent
 * implementation would otherwise appear.
 */
export async function runCreateBooking(
  gameId: string,
  method: ClientPaymentMethod,
): Promise<string | BookingActionState> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("create_booking", {
    p_game_id: gameId,
    p_payment_method: method,
  });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  // PostgREST returns a composite as a single object.
  const result = data as unknown as BookingResult | null;
  if (!result?.id) return { status: "error", code: "UNKNOWN" };

  return result.id;
}
