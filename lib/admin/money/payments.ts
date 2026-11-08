import { readAllPages, readByIds } from "@/lib/admin/money/readAll";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * Money that arrived for bookings in a stretch of time — the ONE reading
 * behind the money page's Revenue, its week chart and Operations' "Confirmed
 * revenue" (round 42, the admin rebuild). There were three copies of this
 * query, two of them on this page; they agreed by luck, not by construction.
 *
 * THROUGH `payment_confirmed` EVENTS. The event carries WHEN the money was
 * confirmed, so the sum counts what was RECEIVED rather than what was owed;
 * there is no `bookings.paid_at` (the first draft of the financials page
 * assumed one and the generated types refused it).
 *
 * `credit_applied_czk` IS SUBTRACTED: a booking paid from Credits moved no new
 * money in this period. A booking with two payment events counts once.
 *
 * EVERY ROW, PAGED — see `readAll.ts`. All time is the case that bites: the
 * events outgrow one 1000-row response first.
 */
export interface Payment {
  bookingId: string;
  /** When the payment was confirmed. */
  at: string;
  czk: number;
}

export interface PaymentBounds {
  /** Inclusive, or null for no lower bound. */
  from: string | null;
  /** Exclusive, or null for no upper bound. */
  to: string | null;
}

export async function paymentsBetween(bounds: PaymentBounds): Promise<Payment[]> {
  const service = createServiceRoleSupabaseClient();

  const events = await readAllPages("payment_confirmed events", (from, to) => {
    let query = service
      .from("events")
      .select("id,booking_id,created_at")
      .eq("event_type", "payment_confirmed")
      .not("booking_id", "is", null);
    if (bounds.from) query = query.gte("created_at", bounds.from);
    if (bounds.to) query = query.lt("created_at", bounds.to);
    return query.order("created_at").order("id").range(from, to);
  });

  // The first confirmation of each booking, in time order.
  const paidAt = new Map<string, string>();
  for (const event of events) {
    if (event.booking_id && !paidAt.has(event.booking_id)) paidAt.set(event.booking_id, event.created_at);
  }
  if (paidAt.size === 0) return [];

  const bookings = await readByIds("paid bookings", [...paidAt.keys()], (ids) =>
    service.from("bookings").select("id,price_czk,credit_applied_czk").in("id", ids),
  );

  return bookings.flatMap((booking) => {
    const at = paidAt.get(booking.id);
    if (!at) return [];
    return [{ bookingId: booking.id, at, czk: Math.max(0, booking.price_czk - booking.credit_applied_czk) }];
  });
}

export function totalCzk(payments: readonly Payment[]): number {
  return payments.reduce((sum, payment) => sum + payment.czk, 0);
}
