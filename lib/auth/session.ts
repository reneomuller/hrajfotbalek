import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { Database } from "@/lib/types/database";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

/**
 * Server-side session helpers.
 *
 * Protected routes are gated HERE, server-side. Hiding a link in the
 * navigation is not access control — the route must refuse the request itself,
 * because anyone can type the URL.
 */

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Returns the verified session user, or null.
 *
 * Uses `getUser()` rather than `getSession()` deliberately: `getSession()`
 * returns whatever is in the cookie without revalidating it, so on the server
 * it is spoofable. `getUser()` round-trips to the auth server and verifies.
 */
/*
 * MEMOISED PER REQUEST (round 37, item 2).
 *
 * `supabase.auth.getUser()` IS A NETWORK CALL — it does not read the cookie and
 * trust it, it asks the auth server to verify the token, which is the whole
 * reason it is preferred over `getSession()` on the server. Nothing memoised
 * it, and a single authenticated render asks it repeatedly: the root layout
 * calls `getCurrentPlayer`, the page calls `getSessionUser` and
 * `getCurrentPlayer` again, the bell reads the player, and `requireSessionUser`
 * calls it once more on any guarded route. Measured on the game detail render:
 * FOUR verification round trips where the request has one session.
 *
 * `cache()` is React's per-REQUEST memo — not a cache with a lifetime, not
 * shared between requests, and torn down when the render finishes. Two renders
 * for two different people can never see each other's user, because they are
 * two different caches; and a session that changes between requests is read
 * fresh on the next one, because there is no next one to be stale in.
 *
 * WHY IT IS SAFE HERE SPECIFICALLY: within one render, the session cannot
 * change. Every caller below was already assuming that — the page reads
 * `signedIn` at the top and acts on it two hundred lines later — so memoising
 * makes an assumption the code already made into one it can rely on.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** The player row for the current session, or null if there is none yet. */
export const getCurrentPlayer = cache(async (): Promise<PlayerRow | null> => {
  /*
   * THROUGH `getSessionUser`, NOT ITS OWN `auth.getUser()` (round 37, item 2).
   *
   * It made the verification call a second time even when the caller had just
   * made it. Routing through the memoised reader means the request verifies
   * once however many of these two functions are called, and the answer cannot
   * differ between them mid-render — which it could before, in principle, on a
   * token that expired between the two calls.
   */
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  // RLS restricts this to the caller's own row, so no filter is needed for
  // safety — it is here only to make the intent obvious at the call site.
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
});

/** Gates a protected route. Redirects to /login when unauthenticated. */
export async function requireSessionUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return user;
}

/**
 * Gates a route that needs a completed profile, not merely a session. A user
 * who has authenticated but not yet chosen a nickname has a session and no
 * player row; sending them to /login would loop them forever, so they go to
 * /signup instead.
 */
export async function requireCurrentPlayer(returnTo?: string): Promise<PlayerRow> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }

  const player = await getCurrentPlayer();
  if (!player) {
    const target = returnTo ? `/signup?next=${encodeURIComponent(returnTo)}` : "/signup";
    redirect(target);
  }
  return player;
}
