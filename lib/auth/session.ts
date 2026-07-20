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
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** The player row for the current session, or null if there is none yet. */
export async function getCurrentPlayer(): Promise<PlayerRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  // RLS restricts this to the caller's own row, so no filter is needed for
  // safety — it is here only to make the intent obvious at the call site.
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

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
