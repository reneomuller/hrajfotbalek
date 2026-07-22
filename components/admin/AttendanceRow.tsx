"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  markAttendanceAction,
  type AttendanceState,
} from "@/app/admin/games/[id]/attendance/actions";
import { PaymentBadge } from "@/components/admin/PaymentBadge";
import type { AdminBookingRow } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";

const INITIAL: AttendanceState = { status: "idle" };

/**
 * One roster row with present / no-show controls.
 *
 * The payment badge sits beside the attendance controls deliberately: the two
 * questions the organizer is answering at close-out are "did they turn up" and
 * "did they pay", and settle is blocked on the second one. Putting them on
 * separate screens would mean discovering the block after doing all the work.
 */
export function AttendanceRow({
  booking,
  gameId,
}: {
  booking: AdminBookingRow;
  gameId: string;
}) {
  const [state, formAction] = useActionState(markAttendanceAction, INITIAL);

  // The server row is the truth; the action state only reports the last write.
  const marked = booking.attendance;

  return (
    <li
      data-testid="attendance-row"
      data-attendance={marked ?? ""}
      className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-surface-card px-5 py-3"
    >
      <span className="min-w-[140px] flex-1 font-condensed text-[16px] font-bold text-white">
        {booking.nickname}
      </span>

      <PaymentBadge status={booking.status} method={booking.paymentMethod} />

      <span className="font-mono text-[10px] uppercase tracking-eyebrow text-faint">
        {marked === "present"
          ? strings.admin.markPresent
          : marked === "no_show"
            ? strings.admin.markNoShow
            : strings.admin.attendanceUnmarked}
      </span>

      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="gameId" value={gameId} />
        <MarkButton
          value="present"
          label={strings.admin.markPresent}
          active={marked === "present"}
          testId="mark-present"
        />
        <MarkButton
          value="no_show"
          label={strings.admin.markNoShow}
          active={marked === "no_show"}
          testId="mark-no-show"
        />
      </form>

      {state.status === "error" && state.message && (
        <span role="alert" className="text-[12px] text-muted">
          {state.message}
        </span>
      )}
    </li>
  );
}

function MarkButton({
  value,
  label,
  active,
  testId,
}: {
  value: string;
  label: string;
  active: boolean;
  testId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="attendance"
      value={value}
      disabled={pending}
      data-testid={testId}
      className={`rounded-cta px-4 py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide disabled:opacity-60 ${
        active
          ? "bg-volt text-surface"
          : "border border-hairline-strong bg-transparent text-bone"
      }`}
    >
      {label}
    </button>
  );
}
