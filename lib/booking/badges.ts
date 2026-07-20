import { strings } from "@/lib/strings";
import type { BookingStatus, PaymentMethod } from "@/lib/types/database";

export type BadgeTone = "paid" | "pending" | "muted";

export interface BookingBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * The payment badge for a booking.
 *
 * Status is read BEFORE payment method: a cancelled cash booking is cancelled,
 * not cash. Terminal states win because they are what the player needs to know
 * first — the method that got them there is history at that point.
 *
 * Within the active states the method decides:
 *   seed_free  -> free (a seeded player owes nothing)
 *   credit     -> paid (the wallet settled it, so there is nothing to chase)
 *   cash       -> cash on the pitch, still `reserved` until an admin confirms
 *   qr         -> paid once confirmed, awaiting payment while reserved
 */
export function bookingBadge(
  status: BookingStatus,
  method: PaymentMethod,
): BookingBadge {
  if (status === "cancelled") {
    return { label: strings.account.badgeCancelled, tone: "muted" };
  }
  if (status === "expired") {
    return { label: strings.account.badgeExpired, tone: "muted" };
  }

  if (method === "seed_free") {
    return { label: strings.account.badgeSeed, tone: "paid" };
  }
  if (method === "credit") {
    return { label: strings.account.badgePaid, tone: "paid" };
  }
  if (method === "cash") {
    return {
      label: strings.account.badgeCash,
      tone: status === "confirmed" ? "paid" : "pending",
    };
  }

  return status === "confirmed"
    ? { label: strings.account.badgePaid, tone: "paid" }
    : { label: strings.account.badgeReserved, tone: "pending" };
}

/**
 * Whether the cancel affordance should be offered.
 *
 * This MIRRORS `cancel_booking`; it does not enforce anything. The RPC refuses
 * a late or non-owned cancellation regardless of what this returns, and the
 * action calls it either way. Policy v1 permits cancellation right up to
 * kickoff (`cutoffHoursBeforeStart: 0`), read from `lib/policy.ts` rather than
 * written as a literal here.
 */
export function canOfferCancel(
  status: BookingStatus,
  startsAt: string,
  now: number,
  cutoffHoursBeforeStart: number,
): boolean {
  if (status !== "reserved" && status !== "confirmed") return false;
  const cutoff =
    new Date(startsAt).getTime() - cutoffHoursBeforeStart * 60 * 60 * 1000;
  return now < cutoff;
}
