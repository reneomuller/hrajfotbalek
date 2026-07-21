import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth/session";
import type { Database } from "@/lib/types/database";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

/**
 * Server-side admin gate.
 *
 * Moved forward from Phase 21 because Phase 18 ships the first admin route,
 * and a route that cancels every booking on a game and moves everyone's money
 * cannot ship three phases ahead of the thing that checks who is calling it.
 * Phase 21 mounts this same helper at the admin layout — it is written to be
 * layout-mountable so no second implementation appears there.
 *
 * WHY THIS EXISTS WHEN THE RPCs ALREADY CHECK: `cancel_game` authorizes an
 * admin `auth.uid()` OR a service-role context, because cron and future bank
 * pollers are legitimate service-role callers. A route running under the
 * service-role key therefore satisfies that check by construction, no matter
 * which human triggered it — leaving "not knowing the URL" as the only thing
 * between any authenticated player and a game cancellation. Inside-function
 * authorization is the right last line of defence; it is not a substitute for
 * identifying the human at the surface.
 *
 * `is_admin` is grantable only through the Supabase dashboard. There is no
 * in-app elevation path, by design.
 */
export async function requireAdmin(): Promise<PlayerRow> {
  const player = await getCurrentPlayer();

  if (!player) {
    // Not signed in, or signed in with no player row yet.
    redirect("/login?next=%2Fadmin");
  }

  if (!player.is_admin) {
    // Deliberately the same destination a signed-out visitor gets: a non-admin
    // learns nothing about whether the route exists.
    redirect("/");
  }

  return player;
}

/** Non-redirecting variant for route handlers that must answer with a status. */
export async function isAdminSession(): Promise<boolean> {
  const player = await getCurrentPlayer();
  return player?.is_admin === true;
}
