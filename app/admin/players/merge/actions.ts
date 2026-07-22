"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

export interface MergeState {
  status: "idle" | "merged" | "error";
  /** Rows repointed across the four tables, as reported by the RPC. */
  rowsMoved?: number;
  message?: string;
}

/**
 * Merge a shadow identity into a real account.
 *
 * The action orchestrates and reports; it never touches a foreign key. The
 * repoint across `bookings`, `waitlist`, `credit_ledger` and `events` happens
 * inside `merge_players`, in one transaction — a partial merge would strand a
 * player's credit on an orphaned row, and `credit_ledger` has UPDATE revoked
 * for clients anyway, so app code could not finish the job even if it tried.
 *
 * This is also the ONLY route by which an email-less shadow ever becomes a
 * real account: the Phase 8 claim needs an exact email match, and a shadow
 * with no email has nothing to match on.
 */
export async function mergePlayersAction(
  _prevState: MergeState,
  formData: FormData,
): Promise<MergeState> {
  await requireAdmin();

  const shadowId = String(formData.get("shadowId") ?? "");
  const survivingId = String(formData.get("survivingId") ?? "");

  if (!shadowId || !survivingId) {
    return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("merge_players", {
    p_shadow_id: shadowId,
    p_surviving_id: survivingId,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/players");
  revalidatePath("/admin/players/merge");
  return { status: "merged", rowsMoved: (data as number | null) ?? 0 };
}
