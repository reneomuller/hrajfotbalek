import type { ClientPaymentMethod } from "@/lib/types/database";

/**
 * Post-auth deep-link resume.
 *
 * Phase 8 already carries the intent through the magic-link round trip: the
 * callback redirects to `/game/<id>/book?resume=book`. This module is the
 * reading half of that contract.
 *
 * THE RULE THIS EXISTS TO UPHOLD: no pre-auth soft hold. Nothing here reserves
 * anything. A resume intent is a note about what the player was trying to do,
 * carried in a URL — the booking comes into existence only when the server
 * action runs `create_booking` under an authenticated session. If this module
 * vanished, the worst outcome would be a player landing on the payment-choice
 * screen instead of the confirmation. No spot would be lost or wrongly held.
 */

export type ResumeAction = "book" | "join_waitlist";

export interface ResumeIntent {
  action: ResumeAction;
  /**
   * The method the player chose BEFORE being sent to authenticate, when there
   * was one. Absent on a resume that came straight from a Book tap on the
   * detail page, in which case the payment choice is still ahead of them.
   */
  method: ClientPaymentMethod | null;
}

function isResumeAction(value: string | null): value is ResumeAction {
  return value === "book" || value === "join_waitlist";
}

function isClientPaymentMethod(value: string | null): value is ClientPaymentMethod {
  return value === "qr" || value === "cash";
}

/**
 * Reads a resume intent out of the post-auth query string.
 *
 * Accepts the loose `Record` shape Next.js hands a page's `searchParams` so
 * callers do not have to normalize it first.
 */
export function readResumeIntent(
  searchParams: Record<string, string | string[] | undefined>,
): ResumeIntent | null {
  const first = (key: string): string | null => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };

  const action = first("resume");
  if (!isResumeAction(action)) return null;

  const rawMethod = first("method");
  return {
    action,
    method: isClientPaymentMethod(rawMethod) ? rawMethod : null,
  };
}

/**
 * The URL to hand `/login?next=` so the intent survives the round trip.
 *
 * The method is included only when the player has actually chosen one, so the
 * resume never invents a payment choice on their behalf.
 */
export function buildResumeUrl(
  gameId: string,
  action: ResumeAction,
  method?: ClientPaymentMethod | null,
): string {
  const params = new URLSearchParams({ resume: action });
  if (method) params.set("method", method);
  return `/game/${gameId}/book?${params.toString()}`;
}
