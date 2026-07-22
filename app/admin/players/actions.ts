"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

export interface GrantCreditState {
  status: "idle" | "granted" | "error";
  /** The player's balance after the grant, straight from the RPC. */
  balanceCzk?: number;
  message?: string;
}

/**
 * Grant (or claw back) wallet credit.
 *
 * The operational case: a payment arrives with a wrong or missing variable
 * symbol, so it cannot be matched to a booking. The admin credits the player
 * and records why — and when they tick the unmatched-payment box, the RPC
 * writes `payment_unmatched` in the SAME transaction as the ledger row and the
 * `credit_issued` event. The explanation for the money can never be missing
 * from the money.
 *
 * No direct `credit_ledger` insert exists in this flow, and none could: the
 * table is append-only with UPDATE/DELETE revoked and no client INSERT grant.
 * The non-negativity rule is the RPC's too — a wallet may never go into debt,
 * and a negative adjustment is exactly where that would otherwise happen.
 */
export async function grantCreditAction(
  _prevState: GrantCreditState,
  formData: FormData,
): Promise<GrantCreditState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim() || null;
  const unmatched = formData.get("unmatched") === "on";

  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };
  if (!Number.isInteger(amount) || amount === 0) {
    return { status: "error", message: toAdminErrorMessage("INVALID_CREDIT_DELTA") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("grant_credit", {
    p_player_id: playerId,
    p_delta_czk: amount,
    p_reason: "admin_grant",
    p_unmatched_payment: unmatched,
    p_note: note,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/players");
  return { status: "granted", balanceCzk: (data as number | null) ?? undefined };
}
