"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { embeddedCheckoutEnabled } from "@/lib/payments/embeddedCheckout";
import { expireOpenCheckouts } from "@/lib/payments/activeExpiry";
import { policy } from "@/lib/policy";

/**
 * ADD GUESTS TO A BOOKING THAT IS ALREADY PAID (round 27, item 2).
 *
 * TWO RAILS AND ONE RULE. The wallet path spends credit inside a single
 * transaction that also checks the seats; the online path creates no booking
 * change at all and hands the decision to the webhook, exactly as pay-first
 * does for a first booking. **Neither rail touches the wallet unless the
 * player pressed the wallet button** — the same rule round 27 item 1 made a
 * spec of, applied to the second place money can now move.
 *
 * THE AMOUNT IS GUEST-ONLY. The player already paid for themselves; charging
 * `price × (1 + guests)` here would bill them twice for their own seat. It is
 * computed on the server from the game's own price, never from a form field.
 *
 * AUTHORIZATION IS INSIDE THE RPCs, NOT HERE. `add_guests_with_credit` and
 * `open_add_guests_checkout` both re-check that the booking belongs to the
 * caller and that the seats exist, under the game's advisory lock. This action
 * is the surface; the functions are the authority, and a curl that skips this
 * file reaches exactly the same refusals.
 */

export interface AddGuestsState {
  status: "idle" | "error";
  /** A product error code the panel maps to copy, never a raw message. */
  code?: "CAPACITY_FULL" | "CREDIT_NEGATIVE_BLOCKED" | "FAILED";
}

const INITIAL: AddGuestsState = { status: "idle" };

export async function addGuestsAction(
  _prev: AddGuestsState,
  formData: FormData,
): Promise<AddGuestsState> {
  const gameId = String(formData.get("gameId") ?? "");
  const bookingId = String(formData.get("bookingId") ?? "");
  const rail = String(formData.get("rail") ?? "");

  /*
   * THE COUNT IS CLAMPED THE SAME WAY EVERY OTHER GUEST COUNT IN THIS PRODUCT
   * IS, and for the same reason: a garbled value must not become a large one.
   * Zero or nonsense refuses rather than silently adding nobody, because
   * unlike the booking form there is no "book them alone" fallback that makes
   * sense here — the player already has their seat.
   */
  const raw = Number(formData.get("guests"));
  const guests =
    Number.isInteger(raw) && raw > 0
      ? Math.min(raw, policy.booking.maxPartyGuests)
      : 0;

  if (!gameId || !bookingId || guests < 1) {
    return { status: "error", code: "FAILED" };
  }

  await requireCurrentPlayer(`/game/${gameId}`);
  const supabase = await createServerSupabaseClient();

  if (rail === "credit") {
    const { error } = await supabase.rpc("add_guests_with_credit", {
      p_booking_id: bookingId,
      p_guest_count: guests,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("CAPACITY_FULL")) {
        return { status: "error", code: "CAPACITY_FULL" };
      }
      if (message.includes("CREDIT_NEGATIVE_BLOCKED")) {
        return { status: "error", code: "CREDIT_NEGATIVE_BLOCKED" };
      }
      console.error("add guests: credit rail refused", {
        booking: bookingId,
        message,
      });
      return { status: "error", code: "FAILED" };
    }

    /*
     * ACTIVE EXPIRY, RAIL 4 (round 26, item 1's list grows by one). Adding
     * guests can take the last seats, and somebody may have a payment form
     * open for this game right now. Killing it at Stripe is what stops their
     * money moving at all.
     *
     * AFTER the guests exist, never before: the seats have to be gone before
     * "is this game full" has the right answer.
     */
    await expireOpenCheckouts(gameId);

    revalidatePath(`/game/${gameId}`);
    /*
     * REDIRECTED RATHER THAN FLAGGED. `revalidatePath` unmounts anything the
     * action returns before it can be read — CLAUDE.md's client-state lesson —
     * so the success signal is the roster itself, which is the thing the
     * player actually wants to see.
     */
    redirect(`/game/${gameId}?added=${guests}`);
  }

  /*
   * THE ONLINE RAIL CHANGES NOTHING HERE. It is pay-first's shape: the intent
   * travels in the URL, the register row is written by the checkout page once
   * Stripe has issued a session, and the WEBHOOK adds the guests under the
   * game's lock once money has arrived.
   */
  if (!embeddedCheckoutEnabled()) {
    return { status: "error", code: "FAILED" };
  }

  redirect(`/payment/checkout?addGuests=${bookingId}&guests=${guests}`);
}

export { INITIAL as ADD_GUESTS_INITIAL };
