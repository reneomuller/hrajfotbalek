import { adminPaymentBadge } from "@/lib/admin/paymentBadge";
import type { BookingStatus, PaymentMethod } from "@/lib/types/database";

const TONE = {
  paid: "border-hairline-volt bg-volt/[.08] text-volt",
  // Round 42 — warn, the colour the seat bar and the seat map give unpaid.
  pending: "border-warn/50 text-warn",
  muted: "border-hairline text-faint",
} as const;

/** Paid / holding / cash / free / credit, as the organizer needs to read it. */
export function PaymentBadge({
  status,
  method,
}: {
  status: BookingStatus;
  method: PaymentMethod;
}) {
  const badge = adminPaymentBadge(status, method);

  return (
    <span
      data-testid="payment-badge"
      data-tone={badge.tone}
      className={`inline-flex shrink-0 whitespace-nowrap rounded-pill border px-[10px] py-[3px] text-[10px] uppercase tracking-eyebrow ${TONE[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}
