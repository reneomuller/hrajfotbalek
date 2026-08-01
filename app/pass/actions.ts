"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
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

  // Straight to the QR, which is the only thing left to do.
  redirect(`/account/topup/${data.id}`);
}
