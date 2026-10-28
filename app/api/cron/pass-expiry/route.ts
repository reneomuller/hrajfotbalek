import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { creditsFromCzk } from "@/lib/admin/credits";
import { sendCreditsExpiringEmail } from "@/lib/email/dispatch";
import { policy } from "@/lib/policy";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * The pass sweep — the expiry, and the heads-up a week before it (§4.2;
 * Obchodní podmínky 5.4 — `policy.credits.expiryWarningDays`, three days
 * before round 41).
 *
 * TWO JOBS, ONE ROUTE, AND THE ORDER MATTERS. The heads-up runs FIRST: sweeping
 * first would expire a batch and then decline to warn about it, which is the
 * one sequence that produces a silent loss. Warning first can at worst warn
 * about something that expires minutes later, which is honest.
 *
 * IDEMPOTENT, both halves, and by construction rather than by care:
 *
 *   * `expire_credit_batches()` writes a compensating negative row per expired
 *     REMAINDER. Once the remainder is zero there is nothing left to write, so
 *     a second run is a no-op and returns 0.
 *   * `batches_expiring_soon()` stamps `expiry_notified_at` in the same
 *     statement that selects the rows, so a second run selects nothing.
 *
 * Vercel Cron is at-least-once, and a retry that re-mails a player — or worse,
 * expires their credit twice — is exactly the failure that erodes trust in an
 * automated system.
 *
 * THE SPENDABLE WINDOW IS ACCEPTED, not a bug to fix here. Between an expiry
 * instant and this sweep, expired credit is still spendable, because balance
 * is SUM(delta_czk) and the compensating row has not been written yet. That
 * was ruled on 2026-08-01: it is bounded by the cron interval and errs in the
 * player's favour. Shortening the interval narrows it; filtering expired rows
 * out of a balance query would re-open the rejected alternative.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  // --- 1. the heads-up, before anything is expired --------------------------
  const { data: due, error: dueError } = await supabase.rpc("batches_expiring_soon", {
    p_days: policy.credits.expiryWarningDays,
  });

  if (dueError) {
    return NextResponse.json({ error: dueError.message }, { status: 500 });
  }

  let warned = 0;

  for (const batch of due ?? []) {
    const { data: player } = await supabase
      .from("players")
      .select("email, nickname")
      .eq("id", batch.player_id)
      .maybeSingle();

    if (!player?.email) continue;

    try {
      // In the player's own language, and in Credits — never crowns.
      await sendCreditsExpiringEmail(player.email, {
        credits: creditsFromCzk(batch.remaining_czk),
        expiresAt: batch.expires_at,
      });
      warned += 1;
    } catch (cause) {
      // Logged, never thrown. The stamp is already written, so this batch will
      // not be warned about again — which is the right trade: a mail provider
      // outage must not leave the sweep unable to run at all, and the expiry
      // itself still happens on time.
      console.error("pass expiry heads-up failed to send", cause);
    }
  }

  // --- 2. the sweep ---------------------------------------------------------
  const { data: expired, error: sweepError } = await supabase.rpc(
    "expire_credit_batches",
  );

  if (sweepError) {
    return NextResponse.json(
      { warned, error: sweepError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    warned,
    scanned: due?.length ?? 0,
    expired: expired ?? 0,
  });
}
