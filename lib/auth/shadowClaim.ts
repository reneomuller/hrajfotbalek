import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Shadow-player claim.
 *
 * An admin may have created a `players` row months ago for someone who booked
 * through WhatsApp. When that person finally signs in, their history must
 * attach to the existing row rather than fork into a duplicate.
 *
 * The authoritative implementation is `claim_shadow_player()` in the database —
 * it runs SECURITY DEFINER because `players` is RLS-bound to the caller's own
 * row, so a session cannot see (let alone update) a shadow row that is not yet
 * theirs. What lives here is the *decision rule*, extracted as a pure function
 * so it can be tested exhaustively without a database, and a thin caller.
 *
 * The rule is EXACT-MATCH-OR-NOTHING. Fuzzy matching would silently bind one
 * person's booking history to another person's account — unrecoverable in
 * practice, and invisible at the moment it happens.
 */

export type ClaimDecision =
  | { action: "already-linked"; playerId: string }
  | { action: "claim"; playerId: string }
  | { action: "create" };

export interface ClaimCandidate {
  id: string;
  email: string | null;
  authUserId: string | null;
}

export interface ClaimInput {
  /** Email on the authenticated session. */
  authEmail: string | null | undefined;
  authUserId: string;
  /** Candidate player rows to consider. */
  candidates: ClaimCandidate[];
}

/**
 * Pure decision function mirroring `claim_shadow_player()`.
 *
 * Case is normalised on both sides because email casing is not semantically
 * meaningful, and the `players_email_key` index is already on `lower(email)` —
 * so "exact" means exact modulo case, consistently with the constraint that
 * actually enforces uniqueness.
 */
export function decideShadowClaim(input: ClaimInput): ClaimDecision {
  const { authEmail, authUserId, candidates } = input;

  // Already bound to this account: never create a second row for them.
  const linked = candidates.find((c) => c.authUserId === authUserId);
  if (linked) {
    return { action: "already-linked", playerId: linked.id };
  }

  // A session with no email cannot match anything by email.
  const normalised = typeof authEmail === "string" ? authEmail.trim().toLowerCase() : "";
  if (normalised.length === 0) {
    return { action: "create" };
  }

  const shadow = candidates.find(
    (c) =>
      // Unclaimed. A row already bound to a DIFFERENT account is never re-bound:
      // that would hand one person's history to someone else.
      c.authUserId === null &&
      // An email-less shadow can never be auto-claimed by any login. It is
      // reachable only through the Phase 25 admin merge tool.
      typeof c.email === "string" &&
      c.email.trim().length > 0 &&
      c.email.trim().toLowerCase() === normalised,
  );

  return shadow ? { action: "claim", playerId: shadow.id } : { action: "create" };
}

/**
 * Invokes the authoritative database claim. Returns the claimed/existing
 * player id, or null when there was nothing to claim (a first-time signup,
 * which the caller resolves by routing to the nickname form).
 */
export async function claimShadowPlayer(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("claim_shadow_player");
  if (error) throw error;
  return (data as string | null) ?? null;
}
