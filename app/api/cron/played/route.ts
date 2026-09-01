import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * The played sweep — hourly (round 24, item 1).
 *
 * WHAT IT FIXES. Nothing advanced a game to `played`: `mark_game_played` is
 * reachable only from the admin attendance screen, so 28 games on production
 * had kicked off and were still `published`, the oldest by four weeks. Every
 * derived number — games played, hours, pitches, every badge, and "players
 * met" — therefore read zero for every player, with the code correct in each
 * case. Ledger row 165.
 *
 * IT ADVANCES AND NOTHING ELSE. Settling stays an explicit admin act; this
 * route does not call `settle_game`, does not mark attendance, and does not
 * touch money. That is not a promise the route can keep on its own, so it is
 * enforced one layer down: `advance_played_games` counts the credit ledger and
 * the live bookings before and after its loop and aborts the whole transaction
 * if either moved. A later round that hangs money off `mark_game_played` will
 * fail this sweep loudly rather than pay people quietly.
 *
 * HOURLY, WHERE THE OTHER FOUR ARE DAILY. The threshold is kickoff + duration
 * + a two-hour buffer, and the buffer is for the GAME rather than for the
 * schedule — so a daily sweep would leave a Tuesday-evening game `published`
 * until Wednesday morning, and a player checking their profile after the match
 * would see the same zero this item exists to remove.
 *
 * IDEMPOTENT BY CONSTRUCTION. `mark_game_played` refuses any status other than
 * `published`/`full`, so a second run in the same window selects the same rows
 * and advances none of them. Vercel Cron is at-least-once.
 *
 * SAFE BEFORE THE MIGRATION LANDS. `app_capabilities().playedSweep` is false
 * until `20260901100000_advance_played_games` is applied, and this returns
 * `available: false` rather than throwing — the same shape every other gated
 * surface uses, so a cron that runs before the owner applies it is a no-op and
 * not a 500 in his inbox.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  const { data: capabilities } = await supabase.rpc("app_capabilities");
  const available = Boolean(
    (capabilities as Record<string, boolean> | null)?.playedSweep,
  );
  if (!available) {
    return NextResponse.json({ available: false, advanced: 0 });
  }

  /*
   * THE BUFFER IS PASSED, NOT DEFAULTED, so the number a reader of this file
   * sees is the number that runs. The function's own default matches it; a
   * default nobody names is a number that only exists in SQL.
   */
  const { data, error } = await supabase.rpc("advance_played_games", {
    p_buffer_minutes: 120,
  });

  if (error) {
    /*
     * A 500 HERE IS A REAL ALARM. The only errors this function raises are its
     * own invariants — the ledger moved, or a booking moved, while it was
     * advancing games — and both mean something has coupled money to a state
     * transition that must never carry any. Per-game failures are swallowed
     * inside the function, so nothing routine reaches this branch.
     */
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ available: true, advanced: data ?? 0 });
}
