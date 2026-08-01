"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { sendRenderedEmail } from "@/lib/email/sendEmail";
import { topupReceiptEmail } from "@/lib/email/templates/topupEmails";
import { siteUrl } from "@/lib/site";

/**
 * Confirm a top-up: one tap, VS-sorted list, same shape as ✓ Paid on a booking.
 *
 * Authorization is inside `confirm_topup` (admin-or-service-role), so this
 * action's `requireAdmin()` is the route guard rather than the gate — a curl
 * against the RPC meets the same refusal.
 *
 * THE RECEIPT IS SENT AFTER THE TRANSACTION, not inside it. The RPC writes
 * ledger, status and event atomically; mail is a side effect that must not be
 * able to roll money back. If the send fails the credit is still real, which is
 * the right way round — a player with credit and no receipt can see their
 * balance, a player with a receipt and no credit cannot spend it.
 */
export async function confirmTopupAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const topupId = String(formData.get("topupId") ?? "");
  const rawReceived = String(formData.get("receivedAmount") ?? "").trim();
  const received = rawReceived === "" ? null : Number.parseInt(rawReceived, 10);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_topup", {
    p_topup_id: topupId,
    p_received_amount_czk: Number.isInteger(received) ? received : null,
  });

  if (error || !data) {
    console.error("confirm_topup failed", error?.message);
    revalidatePath("/admin/topups");
    return;
  }

  // The player's address is not on the top-up row, and the admin's session
  // cannot read another player's row — so the lookup is service-role, the same
  // as every other admin-side email in this product.
  const admin = createServiceRoleSupabaseClient();
  const { data: topup } = await admin
    .from("credit_topups")
    .select("payment_code, player_id")
    .eq("id", topupId)
    .maybeSingle();

  if (topup) {
    const { data: player } = await admin
      .from("players")
      .select("nickname, email")
      .eq("id", topup.player_id)
      .maybeSingle();

    if (player?.email) {
      const rendered = topupReceiptEmail({
        nickname: player.nickname,
        creditedCzk: data.credited_czk,
        balanceCzk: data.balance_czk,
        variableSymbol: topup.payment_code,
        accountUrl: `${await siteUrl()}/account`,
      });
      try {
        await sendRenderedEmail(player.email, rendered);
      } catch (cause) {
        // Logged, never thrown: the money is already credited and a failed
        // receipt must not look to the admin like a failed confirmation.
        console.error("top-up receipt failed to send", cause);
      }
    }
  }

  revalidatePath("/admin/topups");
  revalidatePath("/account");
}
