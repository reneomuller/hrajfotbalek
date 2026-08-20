"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { stripePassUrl, withStripeParams } from "@/lib/payments/stripeLinks";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Buying a pass.
 *
 * A PASS IS A TOP-UP WITH A KNOWN AMOUNT (§4.2), so this lands on the same QR
 * screen every other top-up does — same 27-series VS, same SPD string, same
 * admin confirmation. There is no second payment flow, and building one would
 * have meant a second place for the variable symbol to be got wrong.
 *
 * THE AMOUNT IS NOT SENT. `create_pass_topup` takes only the tier and prices
 * it from `pass_tiers` itself; a crafted call cannot ask for the 20-pass at
 * the 1-pass price because there is no field in which to ask.
 */

export interface PassActionState {
  status: "idle" | "error";
  code?: BookingErrorCode;
}

export async function buyPassAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const user = await getSessionUser();
  if (!user) {
    // Signed out, with the intent preserved: they come back to this page.
    redirect(`/login?next=${encodeURIComponent("/pass")}`);
  }

  const games = Number(formData.get("games") ?? "");
  if (!Number.isInteger(games) || games <= 0) {
    return { status: "error", code: toBookingErrorCode("PASS_TIER_NOT_FOUND") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_pass_topup", {
    p_pass_games: games,
  });

  if (error || !data) {
    return { status: "error", code: toBookingErrorCode(error?.message ?? "") };
  }

  /*
   * A CONFIGURED TIER GOES TO STRIPE; EVERY OTHER TIER IS UNCHANGED
   * (round 8, item 15).
   *
   * THE RECORD IS ALREADY WRITTEN either way. `create_pass_topup` has just
   * created the top-up PENDING and unpaid on the existing rail — with its
   * `'26'`-series variable symbol and its ledger expectations intact — so the
   * only difference between the two branches is where the player is sent to
   * settle it. That is what makes this reversible by clearing one environment
   * variable, and what makes reconciliation possible while it is manual.
   *
   * STAMPED WITH THE TOP-UP ID AND THE PAYER (item 16). `client_reference_id`
   * is the only thread from a line in the Stripe dashboard back to this row.
   *
   * A tier with no link, malformed JSON in the variable, or a URL that does
   * not parse all fall through to the QR screen — the behaviour before any of
   * this existed.
   */
  const link = stripePassUrl(games);
  if (link) {
    const stamped = withStripeParams(link, {
      reference: data.id,
      email: user.email ?? null,
    });
    if (stamped) redirect(stamped);
  }

  // Straight to the QR, which is the only thing left to do.
  redirect(`/account/topup/${data.id}`);
}
