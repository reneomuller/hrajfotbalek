"use server";

import { redirect } from "next/navigation";
import { withToast } from "@/lib/ux/toast";
import { bookingEmailContext } from "@/lib/cron/context";
import { dispatchEmail } from "@/lib/email/dispatch";
import { buildSpdString, amountDueCzk, paymentIban } from "@/lib/payments/spd";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnCreditBalance } from "@/lib/booking/queries";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { buildResumeUrl } from "@/lib/booking/resume";
import { policy } from "@/lib/policy";
import { rememberPendingPurchase } from "@/lib/payments/pendingPurchaseCookie";
import { stripeBookingUrl, withStripeParams } from "@/lib/payments/stripeLinks";
import { embeddedCheckoutEnabled } from "@/lib/payments/embeddedCheckout";
import type { BookingResult, ClientPaymentMethod } from "@/lib/types/database";

export interface BookingActionState {
  status: "idle" | "error";
  code?: BookingErrorCode;
}

/**
 * What the UI offers (round 7, item 10) and what it books onto.
 *
 * TWO VOCABULARIES, DELIBERATELY. The player chooses ONLINE or CASH; the
 * database still records `qr` or `cash`, because ruling R3 forbids touching
 * the QR rail — it is the substrate Stripe maps onto, and its variable
 * symbols, `create_topup` / `confirm_topup` and the credit ledger all remain
 * exactly as they are. What changed is the label, not the transition.
 *
 * So `online` -> `qr` is a UI-to-rail translation and not a lie about the
 * booking: both produce an UNPAID booking that the admin unpaid view can
 * settle. When Stripe is integrated this mapping is the one line that moves.
 */
/**
 * TWO OPTIONS SINCE ROUND 23 ITEM 7. `cash` left the booking flow entirely;
 * the RAIL it maps onto did not, because "Redeem credit" still travels on it.
 */
type BookingOption = "credit" | "online";

/**
 * `credit` MAPS TO `cash`, AND THAT NEEDS SAYING (round 8, item 11).
 *
 * `create_booking` derives the `credit` payment method ITSELF when a wallet
 * covers the price — it is an OUTCOME, and the RPC rejects it outright as an
 * input. So choosing "Redeem credit" sends the same `cash` the third option
 * does, and the RPC answers `credit` because the balance is there. The ledger
 * sees exactly what it saw before: one redemption, spending the same amount.
 *
 * The UI is now explicit about something the server already did silently.
 * That is the reversal item 11 records — see `PaymentMethodChoice`.
 */
const OPTION_TO_METHOD: Record<BookingOption, ClientPaymentMethod> = {
  credit: "cash",
  online: "qr",
};

function isBookingOption(value: unknown): value is BookingOption {
  // `cash` is REFUSED HERE TOO, not only hidden in the UI: a form post is a
  // POST endpoint, and an option removed from a radio group is still an
  // option anyone can type into curl. Round 23, item 7.
  return value === "credit" || value === "online";
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
  const rawOption = formData.get("option");

  if (!gameId) return { status: "error", code: "GAME_NOT_FOUND" };

  /*
   * THE PARTY, CLAMPED RATHER THAN TRUSTED.
   *
   * The control only ever posts 0..3, and this is the other case: a hand-made
   * POST, or a stale tab from before the pitch filled up. Clamping to the
   * policy ceiling here is a convenience for the UI, NOT the enforcement —
   * `create_booking` holds its own ceiling and raises PARTY_TOO_LARGE, and it
   * is the one that counts seats under the game's advisory lock. A garbled
   * value becomes zero, which books the player alone rather than refusing
   * them outright.
   */
  const rawGuests = Number(formData.get("guests"));
  const guests =
    Number.isInteger(rawGuests) && rawGuests > 0
      ? Math.min(rawGuests, policy.booking.maxPartyGuests)
      : 0;
  if (!isBookingOption(rawOption)) {
    // Reaching here means the form was tampered with — the UI only ever offers
    // the two values. Refuse rather than defaulting to one.
    return { status: "error", code: "INSUFFICIENT_PERMISSION" };
  }

  /*
   * ONLINE IS REFUSED SERVER-SIDE WHEN THERE IS NOWHERE TO SEND ANYONE.
   *
   * The form disables the option, which handles every honest player. This
   * handles the other case, and it is not paranoia: without it a stale tab
   * from before the variable was cleared, or a hand-made POST, creates an
   * unpaid booking whose player is then dropped on a confirmation screen with
   * no way to pay. Refusing is the behaviour the item asks for — Confirm is
   * never live with a dead path behind it — enforced where it cannot be
   * bypassed.
   */
  const online = rawOption === "online";
  /*
   * TWO RAILS, AND THE GATE IS "IS THERE ANYWHERE TO PAY" RATHER THAN "WHICH
   * ONE" (round 25, item 2). Embedded checkout is preferred when both Stripe
   * keys are set; the Payment Link is the fallback and keeps working
   * unchanged until then. Either counts as a live path — what must never
   * happen is Confirm being live with NEITHER behind it.
   */
  const embedded = embeddedCheckoutEnabled();
  const payUrl = stripeBookingUrl();
  if (online && !embedded && !payUrl) {
    return { status: "error", code: "INSUFFICIENT_PERMISSION" };
  }

  /*
   * CREDIT IS REFUSED SERVER-SIDE WHEN THE WALLET DOES NOT COVER THE SEATS
   * (round 23, item 7).
   *
   * This is the one remaining way a `cash` booking could still be created
   * after cash left the flow, and it is not hypothetical: `credit` maps onto
   * the `cash` RAIL, so a hand-made POST — or a stale tab from before a
   * balance was spent — would reach `create_booking`, find no credit to
   * apply, and leave an UNPAID booking behind on a product that no longer
   * takes cash. The form already disables the option; this is the half a form
   * cannot enforce.
   *
   * THE RPC REMAINS THE AUTHORITY on what the balance actually is. This asks
   * the same question a moment earlier so the answer can be a product error
   * the UI already renders, rather than an unpaid seat nobody can settle.
   */
  if (rawOption === "credit") {
    const supabase = await createServerSupabaseClient();
    const [balanceCzk, priceRow] = await Promise.all([
      getOwnCreditBalance(),
      supabase.from("games").select("price_czk").eq("id", gameId).maybeSingle(),
    ]);
    const priceCzk = priceRow.data?.price_czk ?? null;
    // The same arithmetic `PaymentMethodChoice` does to disable the radio:
    // seats are the player plus their guests, at one price each.
    if (priceCzk === null || balanceCzk < priceCzk * (guests + 1)) {
      return { status: "error", code: "CREDIT_NEGATIVE_BLOCKED" };
    }
  }

  const method = OPTION_TO_METHOD[rawOption];

  // No pre-auth soft hold: an unauthenticated caller is sent to authenticate
  // and the booking is attempted only afterwards. Nothing is reserved here.
  const user = await getSessionUser();
  if (!user) {
    const resume = buildResumeUrl(gameId, "book", method);
    redirect(`/login?next=${encodeURIComponent(resume)}`);
  }

  /*
   * `online` IS PASSED THROUGH, and it is the whole of round 12 item 5(a) at
   * this layer. A booking marked online holds its seats for thirty minutes
   * instead of forever, and only the Stripe webhook can settle it.
   */
  const bookingId = await runCreateBooking(gameId, method, guests, online);
  if (typeof bookingId !== "string") return bookingId;

  /*
   * THE BOOKING EXISTS BEFORE THE PLAYER LEAVES, which is the right order.
   * The spot is held the moment `create_booking` returns; the payment page is
   * where they settle it. Booking after payment would mean taking money for a
   * spot that a race may already have given away.
   */
  if (online && embedded) {
    /*
     * THE PLAYER NEVER LEAVES. `/payment/checkout` computes the exact amount
     * from this booking — party size included — and renders Stripe's form
     * inside our own page. The cookie is still written, because the RETURN is
     * unchanged: `/payment/return` is where Stripe sends them back, and it
     * still has to know what was being bought.
     */
    await rememberPendingPurchase({ kind: "booking", id: bookingId });
    redirect(`/payment/checkout?booking=${bookingId}`);
  }

  if (online && payUrl) {
    /*
     * STAMPED WITH THE BOOKING ID AND THE PAYER (item 16). Reconciliation is
     * manual, so `client_reference_id` is the only thread from a line in the
     * Stripe dashboard back to a row here. A configured URL that does not
     * parse falls through to the confirmation rather than sending anyone to a
     * broken address.
     */
    const stamped = withStripeParams(payUrl, {
      reference: bookingId,
      email: user?.email ?? null,
    });
    if (stamped) {
      /*
       * REMEMBERED BEFORE THEY LEAVE (round 15, item 1). Every Payment Link
       * returns to ONE url — `/payment/return` — which carries nothing about
       * what was bought, so the return page has to be told. This is the only
       * moment in the whole flow where the id and a `Set-Cookie` header exist
       * in the same request: it is minted three lines up and the redirect
       * happens on the next one.
       *
       * The same value goes into the cookie and into `client_reference_id`,
       * so the thread the webhook follows and the thread the browser follows
       * cannot name different rows.
       */
      await rememberPendingPurchase({ kind: "booking", id: bookingId });
      redirect(stamped);
    }
  }

  // The booking-created toast rides the redirect the flow already performs —
  // the acting request and the request that renders the confirmation are
  // different requests, and a kind in the URL is what survives that.
  redirect(
    withToast(`/game/${gameId}/book/confirmation?booking=${bookingId}`, "bookingCreated"),
  );
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
  /**
   * Extra seats. Defaults to zero so the POST-AUTH RESUME PATH books a single
   * spot: `buildResumeUrl` carries a game and a method through a login round
   * trip and has never carried a party. Sending someone to sign in and
   * bringing them back with two guests they chose before authenticating is a
   * different feature — the resume URL would have to carry the size, and a
   * URL that books three paid seats is a URL worth thinking about separately.
   */
  guests = 0,
  /**
   * Whether this booking is waiting on Stripe.
   *
   * Defaults to FALSE, which is what the post-auth resume path wants: it
   * carries a game and a method through a login round trip, and a player
   * coming back from `/login` has not been to Stripe. Marking that booking
   * pending would expire it thirty minutes later with nothing having gone
   * wrong.
   */
  online = false,
): Promise<string | BookingActionState> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("create_booking", {
    p_game_id: gameId,
    p_payment_method: method,
    p_guest_count: guests,
    p_online: online,
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
