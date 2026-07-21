"use server";

import { redirect } from "next/navigation";
import { bookingEmailContext } from "@/lib/cron/context";
import { dispatchEmail } from "@/lib/email/dispatch";
import { buildSpdString, amountDueCzk, paymentIban } from "@/lib/payments/spd";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
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

  await dispatchBookingEmails(result);

  return result.id;
}

/**
 * Emails for a freshly created booking.
 *
 * Branches on the DERIVED method the RPC returned, never on what was sent: a
 * wallet that covered the price comes back `credit` and `confirmed`, and that
 * booking must get the receipt only — the dispatch layer suppresses the
 * spot-held email for exactly this case.
 *
 * Never allowed to fail the booking. The spot is already committed inside the
 * database; an SMTP problem must not unwind it or surface as a booking error.
 */
async function dispatchBookingEmails(result: BookingResult): Promise<void> {
  try {
    // Service-role for the reads only: the player cannot select their own
    // email through RLS on players in every path, and the game row is public.
    const supabase = createServiceRoleSupabaseClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, game_id, player_id, price_czk, credit_applied_czk, payment_code")
      .eq("id", result.id)
      .maybeSingle();
    if (!booking) return;

    const [{ data: game }, { data: player }] = await Promise.all([
      supabase.from("games").select("id, venue, starts_at").eq("id", booking.game_id).maybeSingle(),
      supabase.from("players").select("email, nickname").eq("id", booking.player_id).maybeSingle(),
    ]);
    if (!game || !player) return;

    const instantConfirmed = result.status === "confirmed";
    const context = await bookingEmailContext(booking, game, player, {
      withIcs: true,
    });

    const due = amountDueCzk(booking.price_czk, booking.credit_applied_czk);
    await dispatchEmail({
      event: "booking_created",
      to: player.email,
      context: {
        ...context,
        instantConfirmed,
        variableSymbol: booking.payment_code ?? undefined,
        spdString:
          booking.payment_code && due > 0
            ? buildSpdString({
                iban: paymentIban(),
                amountCzk: due,
                variableSymbol: booking.payment_code,
                nickname: player.nickname,
              })
            : undefined,
      },
    });

    if (instantConfirmed) {
      await dispatchEmail({
        event: "payment_confirmed",
        to: player.email,
        context,
      });
    }
  } catch (error) {
    console.error("booking email dispatch failed", error);
  }
}
