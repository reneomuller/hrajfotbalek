"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { strings } from "@/lib/strings";
import { czkFromCredits } from "@/lib/admin/credits";
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
  /*
   * THE FORM SPEAKS CREDITS; THE LEDGER SPEAKS CROWNS (round 31, item 3).
   *
   * `amount` is now a whole number of CREDITS — the same unit the player reads
   * on their wallet — and it is converted here, once, at the ruling's rate.
   * The admin used to type crowns while the player read credits, which left
   * the translation living in the organizer's head.
   *
   * CONVERTED IN THE ACTION AND NOT IN THE FORM, because a hidden field
   * carrying a pre-multiplied number is a number a hand-made POST can set to
   * anything. The credits are what crosses the wire; the crowns are derived
   * where they cannot be tampered with.
   */
  const credits = Number(String(formData.get("amount") ?? "").trim());
  const amount = czkFromCredits(credits);
  /*
   * THE NOTE IS REQUIRED (round 7, item 9), and it is required HERE rather
   * than only in the form — the form's `required` attribute is skipped by
   * anything that is not a browser, and this action is a POST endpoint.
   *
   * `grant_credit` accepts a null note and will go on accepting one: the RPC
   * is also called by the seed and by top-up confirmation, which have their
   * own provenance. What must carry a reason is a HAND-WRITTEN grant, which is
   * this path.
   */
  const note = String(formData.get("note") ?? "").trim() || null;
  const unmatched = formData.get("unmatched") === "on";

  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };
  // VALIDATED ON THE CREDITS, which is the number the admin actually typed —
  // an error about crowns would name a figure they never entered.
  if (!Number.isInteger(credits) || credits === 0) {
    return { status: "error", message: toAdminErrorMessage("INVALID_CREDIT_DELTA") };
  }
  if (note === null || note.length < 3) {
    return { status: "error", message: strings.admin.grantNoteRequired };
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

/**
 * REMOVE credit from a wallet (round 28, item 5b).
 *
 * THE SAME RPC, WITH THE SIGN FLIPPED — not a second write path. `grant_credit`
 * already takes a signed delta, already floors the balance at zero under the
 * player's advisory lock, and already refuses `redemption`. A separate
 * remove-credit function would be a second implementation of "may this wallet
 * absorb this movement", able to disagree with the first.
 *
 * `adjustment`, NOT `admin_grant`. The reason column is what a later reader
 * sorts by, and calling a removal a grant makes the ledger lie in the one
 * place it is consulted.
 *
 * THE NOTE IS REQUIRED AND THE FORM IS NOT WHERE THAT IS DECIDED. Taking money
 * out of somebody's wallet is the most consequential thing in this panel, and
 * `required` on an input is skipped by anything that is not a browser. Round 7
 * made the same call for grants; this is the case that needed it more.
 *
 * THE FLOOR IS THE RPC'S. This action does not read the balance and then
 * decide — a check here would be a snapshot, and two admins removing credit at
 * once would each see enough. `CREDIT_NEGATIVE_BLOCKED` comes back from under
 * the lock and is rendered as the product error it is.
 */
export async function removeCreditAction(
  _prevState: GrantCreditState,
  formData: FormData,
): Promise<GrantCreditState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  // Whole CREDITS, converted once (round 31, item 3) — see the grant above.
  const credits = Number(String(formData.get("amount") ?? "").trim());
  const amount = czkFromCredits(credits);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };

  /*
   * THE FORM ASKS FOR A POSITIVE NUMBER TO REMOVE, so a negative one here is a
   * hand-made POST or a confused admin — and silently negating it would remove
   * money on a form that reads "remove 50" when the field said "-50". Refused
   * rather than interpreted.
   */
  if (!Number.isInteger(credits) || credits <= 0) {
    return { status: "error", message: toAdminErrorMessage("INVALID_CREDIT_DELTA") };
  }
  if (note === null || note.length < 3) {
    return { status: "error", message: strings.admin.grantNoteRequired };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("grant_credit", {
    p_player_id: playerId,
    p_delta_czk: -amount,
    p_reason: "adjustment",
    p_unmatched_payment: false,
    p_note: note,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${playerId}`);
  return { status: "granted", balanceCzk: (data as number | null) ?? undefined };
}

export interface AdminRightsState {
  status: "idle" | "changed" | "error";
  /** The flag as it stands after the change, straight from the RPC. */
  isAdmin?: boolean;
  message?: string;
}

/**
 * Grant or revoke another player's admin rights.
 *
 * THIS SUPERSEDES THE DASHBOARD-ONLY RULE, and does so deliberately. That rule
 * bought one real property — no in-app elevation path — at the cost of making a
 * second organizer require a Supabase dashboard login, which is a far broader
 * credential than "can run games" and not something the person running this
 * should need.
 *
 * The property itself is preserved, inside `set_player_admin`: the caller must
 * already be an admin, and a caller may never change their OWN flag in either
 * direction. Those two together mean the subject and the authorizer are never
 * the same person, which is what "no self-elevation" actually means. Both
 * checks live in the function, against `auth.uid()` — this action supplies an
 * id and renders the outcome, and could not authorize anything if it tried.
 *
 * On the SESSION client, not the service-role one, and that matters more here
 * than anywhere else: `set_player_admin` is the single RPC in this codebase
 * that service_role is NOT granted, precisely so that the one function which
 * mints privilege cannot be reached by the widest credential in the system.
 */
export async function setPlayerAdminAction(
  _prevState: AdminRightsState,
  formData: FormData,
): Promise<AdminRightsState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  const isAdmin = formData.get("isAdmin") === "true";

  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_player_admin", {
    p_player_id: playerId,
    p_is_admin: isAdmin,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/players");
  return { status: "changed", isAdmin: (data as boolean | null) ?? isAdmin };
}
