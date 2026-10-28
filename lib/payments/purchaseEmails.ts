import { creditsFromCzk } from "@/lib/admin/credits";
import { bookingEmailContext } from "@/lib/cron/context";
import { dispatchEmail, sendCreditsPurchasedEmail } from "@/lib/email/dispatch";
import { emailLocalePreference } from "@/lib/email/recipientLocale";
import type { PaymentReceipt } from "@/lib/email/templates/parts";
import { resolveStrings } from "@/lib/i18n/resolve";
import { termsAgreementWording } from "@/lib/legal/consentWording";
import { creditsValidUntil } from "@/lib/legal/purchaseSummary";
import { parseCheckoutConsent } from "@/lib/payments/checkoutConsent";
import type { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

type Service = ReturnType<typeof createServiceRoleSupabaseClient>;

/**
 * THE EMAIL A CARD PAYMENT EARNS (round 41).
 *
 * Found on 2026-10-19 and logged as row 380: "a card-paid booking currently
 * sends no email at all", and no Credit purchase had ever sent a receipt — the
 * template existed and nothing called it. Under the terms every card payment
 * buys Credits (Obchodní podmínky 5.1), so every one of them now gets a receipt
 * with the box above Pay exactly as ticked and the terms attached (Texty 5.1):
 *
 *   booked     a single game, or guests added — "You're in." plus the receipt
 *   credited   the seat went while they paid — the Credits receipt, explained
 *   confirmed  a pass — the Credits receipt
 *
 * Called once per outcome: `settle_checkout_session` and
 * `confirm_online_purchase` answer `already` to Stripe's retries, and those
 * send nothing. NEVER THROWS — the money is settled by the time this runs, and
 * a mail problem must not turn a 200 into a retry.
 */
export async function sendPurchaseEmails(
  supabase: Service,
  input: { payload: string; outcome: string; sessionId: string; reference: string | null; amountCzk: number },
): Promise<void> {
  try {
    if (input.outcome === "booked" || input.outcome === "credited") {
      await afterCheckout(supabase, input);
    } else if (input.outcome === "confirmed" && input.reference) {
      await afterPurchase(supabase, input.reference, input);
    }
  } catch (error) {
    console.error("stripe webhook: purchase email failed", {
      session: input.sessionId,
      outcome: input.outcome,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The terms box as ticked, in the language it was ticked in, and when. */
function termsFrom(payload: string): PaymentReceipt["terms"] {
  const consent = parseCheckoutConsent(payload);
  if (!consent) return null;
  return { wording: termsAgreementWording(resolveStrings(consent.locale)), acceptedAt: consent.acceptedAt };
}

function cardReceipt(
  input: { sessionId: string; amountCzk: number; payload: string },
  extra: Partial<PaymentReceipt> = {},
): PaymentReceipt {
  const paidAt = new Date();
  return {
    orderId: input.sessionId,
    paidAt: paidAt.toISOString(),
    credits: creditsFromCzk(input.amountCzk),
    amountCzk: input.amountCzk,
    method: "card",
    validUntil: creditsValidUntil(paidAt).toISOString(),
    terms: termsFrom(input.payload),
    ...extra,
  };
}

/** The account's language, else the one the checkout was paid in. */
async function readerLocale(email: string, payload: string) {
  return (await emailLocalePreference(email)) ?? parseCheckoutConsent(payload)?.locale;
}

async function balanceCredits(supabase: Service, playerId: string): Promise<number | null> {
  const { data, error } = await supabase.from("credit_ledger").select("delta_czk").eq("player_id", playerId);
  if (error || !data) return null;
  return creditsFromCzk((data as { delta_czk: number }[]).reduce((sum, row) => sum + row.delta_czk, 0));
}

async function afterCheckout(
  supabase: Service,
  input: { payload: string; outcome: string; sessionId: string; amountCzk: number },
): Promise<void> {
  const { data: row } = await supabase
    .from("checkout_sessions")
    .select("game_id, player_id, booking_id, guest_count, kind")
    .eq("stripe_session_id", input.sessionId)
    .maybeSingle();
  const session = row as {
    game_id: string;
    player_id: string;
    booking_id: string | null;
    guest_count: number | null;
    kind: string;
  } | null;
  if (!session) return;

  const { data: player } = await supabase
    .from("players")
    .select("email, nickname")
    .eq("id", session.player_id)
    .maybeSingle();
  if (!player?.email) return;
  const locale = await readerLocale(player.email, input.payload);

  if (input.outcome === "credited") {
    await sendCreditsPurchasedEmail(
      player.email,
      {
        paid: cardReceipt(input),
        balanceCredits: await balanceCredits(supabase, session.player_id),
        gameFull: true,
      },
      locale,
    );
    return;
  }

  const [{ data: game }, { data: booking }] = await Promise.all([
    supabase.from("games").select("id, venue, starts_at").eq("id", session.game_id).maybeSingle(),
    session.booking_id
      ? supabase
          .from("bookings")
          .select("price_czk, credit_applied_czk, guest_count")
          .eq("id", session.booking_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!game) return;

  const context = await bookingEmailContext(
    booking ?? { price_czk: input.amountCzk, credit_applied_czk: input.amountCzk, guest_count: session.guest_count ?? 0 },
    game,
    player,
    { withIcs: session.kind !== "add_guests" },
  );
  await dispatchEmail({
    event: "payment_confirmed",
    to: player.email,
    locale,
    context: {
      ...context,
      bookingKind: session.kind === "add_guests" ? "guests" : "booking",
      // What THIS payment bought: the guests' places, not the whole booking's.
      creditsPaid: creditsFromCzk(input.amountCzk),
      receipt: cardReceipt(input, { usedForGame: true }),
    },
  });
}

async function afterPurchase(
  supabase: Service,
  reference: string,
  input: { payload: string; sessionId: string; amountCzk: number },
): Promise<void> {
  const { data: topup } = await supabase
    .from("credit_topups")
    .select("player_id, pass_games")
    .eq("id", reference)
    .maybeSingle();
  const purchase = topup as { player_id: string; pass_games: number | null } | null;
  if (!purchase) {
    await afterBookingPayment(supabase, reference, input);
    return;
  }

  const { data: player } = await supabase
    .from("players")
    .select("email")
    .eq("id", purchase.player_id)
    .maybeSingle();
  if (!player?.email) return;

  const paid = cardReceipt(input);
  await sendCreditsPurchasedEmail(
    player.email,
    {
      // A pass is sold as a number of Credits at a discount: the count is the
      // tier's, not the crowns divided by the full price.
      paid: purchase.pass_games ? { ...paid, credits: purchase.pass_games } : paid,
      balanceCredits: await balanceCredits(supabase, purchase.player_id),
    },
    await readerLocale(player.email, input.payload),
  );
}

/**
 * The older route: a reservation made first and paid online after
 * (`confirm_online_purchase` with a BOOKING as its reference). Same email as a
 * checkout — the place is confirmed and the money bought a Credit.
 */
async function afterBookingPayment(
  supabase: Service,
  bookingId: string,
  input: { payload: string; sessionId: string; amountCzk: number },
): Promise<void> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("game_id, player_id, price_czk, credit_applied_czk, guest_count")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const [{ data: game }, { data: player }] = await Promise.all([
    supabase.from("games").select("id, venue, starts_at").eq("id", booking.game_id).maybeSingle(),
    supabase.from("players").select("email, nickname").eq("id", booking.player_id).maybeSingle(),
  ]);
  if (!game || !player?.email) return;

  const context = await bookingEmailContext(booking, game, player, { withIcs: true });
  await dispatchEmail({
    event: "payment_confirmed",
    to: player.email,
    locale: await readerLocale(player.email, input.payload),
    context: {
      ...context,
      creditsPaid: creditsFromCzk(input.amountCzk),
      receipt: cardReceipt(input, { usedForGame: true }),
    },
  });
}
