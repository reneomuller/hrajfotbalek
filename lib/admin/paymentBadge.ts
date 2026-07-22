import { strings } from "@/lib/strings";
import type { BookingStatus, PaymentMethod } from "@/lib/types/database";

export type AdminBadgeTone = "paid" | "pending" | "muted";

export interface AdminBadge {
  label: string;
  tone: AdminBadgeTone;
}

/**
 * The admin-side payment badge.
 *
 * Deliberately NOT `lib/booking/badges.ts`. That one answers a player's
 * question — "where does my booking stand" — and says "holding"/"in". This one
 * answers the organizer's: "is this person's money accounted for, and if not,
 * what am I chasing". A cash booking is `Cash` here because that tells the
 * organizer what to collect on the pitch, where the player's own badge just
 * says the spot is held.
 *
 * Terminal states win over method, same as the player badge: a cancelled cash
 * booking is cancelled, and the method that got it there is history.
 */
export function adminPaymentBadge(
  status: BookingStatus,
  method: PaymentMethod,
): AdminBadge {
  if (status === "cancelled") return { label: strings.admin.badge.cancelled, tone: "muted" };
  if (status === "expired") return { label: strings.admin.badge.expired, tone: "muted" };

  if (method === "seed_free") return { label: strings.admin.badge.seed, tone: "paid" };
  if (method === "credit") return { label: strings.admin.badge.credit, tone: "paid" };

  if (status === "confirmed") return { label: strings.admin.badge.paid, tone: "paid" };

  // Still reserved: what is owed, and how it is expected to arrive.
  if (method === "cash") return { label: strings.admin.badge.cash, tone: "pending" };
  return { label: strings.admin.badge.reserved, tone: "pending" };
}
