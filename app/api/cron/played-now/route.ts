import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { policy } from "@/lib/policy";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * Every five minutes: a game is played once it has FINISHED (the owner,
 * 2026-11-09 — "a game from 18:00-19:30 would dissapear from view at 19:30 and
 * get marked as played automatically").
 *
 * The same sweep `/api/cron/played` runs at 06:30, asked for games past their
 * END with no buffer (`policy.game.playedAfterEndMinutes`), which Vercel Pro's
 * unlimited crons made possible. The daily run stays as it was: its two-hour
 * buffer and its report of games that could not settle belong to a once-a-day
 * look, and reporting them from here would say so 288 times a day.
 *
 * Nothing on screen waits for this — the lists already go by the clock
 * (`lib/games/duration.ts`). It is what moves the STATUS, which the profile
 * counts and the settle step read.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  const { data: capabilities } = await supabase.rpc("app_capabilities");
  if (!(capabilities as Record<string, boolean> | null)?.playedSweep) {
    return NextResponse.json({ available: false, advanced: 0 });
  }

  const { data, error } = await supabase.rpc("advance_played_games", {
    p_buffer_minutes: policy.game.playedAfterEndMinutes,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? {}) as { advanced?: number; settled?: number };
  return NextResponse.json({ available: true, advanced: result.advanced ?? 0, settled: result.settled ?? 0 });
}
