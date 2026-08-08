"use client";

import Link from "next/link";
import { describeBookingError, type BookingErrorCode } from "@/lib/booking/errors";
import { useStrings } from "@/components/LocaleProvider";

export interface BookingErrorProps {
  code: BookingErrorCode;
  gameId: string;
}

/**
 * Friendly rendering of an RPC rejection.
 *
 * A race loser must never see a raw Postgres error. `CAPACITY_FULL` in
 * particular is not a fault condition — someone else simply tapped first —
 * so it reads as information, and the page still offers a way onward.
 */
export function BookingError({ code, gameId }: BookingErrorProps) {
  const t = useStrings();
  const { title, message } = describeBookingError(code, t);

  return (
    <div
      data-testid="booking-error"
      data-error-code={code}
      className="rounded-card border border-hairline-strong bg-surface p-5"
    >
      <div className="font-condensed text-[19px] font-bold uppercase tracking-wide text-white">
        {title}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{message}</p>

      <Link
        href={`/game/${gameId}`}
        className="mt-5 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
      >
        {t.booking.backToGame}
      </Link>
    </div>
  );
}
