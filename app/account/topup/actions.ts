"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { getStrings } from "@/lib/i18n/server";
import { TOPUP_MAX_CZK, TOPUP_MIN_CZK } from "@/lib/payments/topup";

export interface TopupFormState {
  status: "idle" | "error";
  message?: string;
}

/**
 * Requests a top-up and sends the player to its QR screen.
 *
 * The amount is validated here for a friendly message and authoritatively in
 * `create_topup`, which is also the only thing that can mint a variable symbol.
 * There is no player argument anywhere in the chain: the wallet credited is the
 * session's, and nothing in the form can say otherwise.
 */
export async function createTopupAction(
  _prevState: TopupFormState,
  formData: FormData,
): Promise<TopupFormState> {
  const t = await getStrings();

  const raw = String(formData.get("amount") ?? "").trim();
  const amount = Number.parseInt(raw, 10);

  if (!Number.isInteger(amount) || amount < TOPUP_MIN_CZK || amount > TOPUP_MAX_CZK) {
    return { status: "error", message: t.account.topupOutOfRange };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_topup", { p_amount_czk: amount });

  if (error || !data) {
    console.error("create_topup failed", error?.message);
    return { status: "error", message: t.errors.generic };
  }

  redirect(`/account/topup/${data.id}`);
}
