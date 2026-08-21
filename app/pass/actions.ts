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

  /*
   * THE LINK IS RESOLVED BEFORE ANYTHING IS WRITTEN (round 13, item 7).
   *
   * ~~The record was created first and a missing link fell through to the QR
   * screen — "the behaviour before any of this existed".~~ There is no QR
   * screen any more (item 6), so a tier with no link would leave a `pending`
   * purchase behind with nowhere to pay it. Resolving first means an
   * unconfigured tier writes nothing at all.
   *
   * NEVER THE SINGLE-GAME LINK AS A FALLBACK. Tier prices are DISCOUNTED, so
   * paying a tier through the per-game link — even at the right quantity —
   * charges the undiscounted price. A tier with no link of its own is not a
   * tier that can be sold, and the button says "Coming soon" rather than
   * selling it wrong.
   */
  const link = stripePassUrl(games);
  if (!link) {
    return { status: "error", code: "PASS_NOT_CONFIGURED" };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("begin_pass_purchase", {
    p_pass_games: games,
  });

  if (error || !data) {
    return { status: "error", code: toBookingErrorCode(error?.message ?? "") };
  }

  /*
   * PENDING FROM THE MOMENT IT EXISTS, exactly like an online booking
   * (round 12, item 5). `begin_pass_purchase` stamps `payment_pending_at`, so
   * an abandoned checkout leaves a row that resolves itself into "not paid"
   * rather than a purchase that waits forever for an admin who no longer has
   * a screen to confirm it on.
   *
   * STAMPED WITH THE PURCHASE ID AND THE PAYER. `client_reference_id` is the
   * only thread from a line in the Stripe dashboard back to this row, and it
   * is what `confirm_online_purchase` dispatches on.
   */
  const stamped = withStripeParams(link, {
    reference: (data as { id: string }).id,
    email: user.email ?? null,
  });

  if (!stamped) {
    return { status: "error", code: "PASS_NOT_CONFIGURED" };
  }

  redirect(stamped);
}
