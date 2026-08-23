"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  markAttendanceAction,
  type AttendanceState,
} from "@/app/admin/games/[id]/attendance/actions";
import { PaymentBadge } from "@/components/admin/PaymentBadge";
import { RemovePlayerControl } from "@/components/admin/RemovePlayerControl";
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
  canRemove = false,
}: {
  booking: AdminBookingRow;
  gameId: string;
  /**
   * Whether this database can release a seat (round 16, item 17).
   * `admin_remove_booking` arrives with the round-16 migration and the code
   * ships first, so false hides the control rather than offering a 404.
   */
  canRemove?: boolean;
}) {
  const [state, formAction] = useActionState(markAttendanceAction, INITIAL);

  // The server row is the truth; the action state only reports the last write.
  const marked = booking.attendance;
  // Only a live seat can be released. A cancelled row is already released.
  const isActive = booking.status === "reserved" || booking.status === "confirmed";

  return (
    <li
      data-testid="attendance-row"
      data-attendance={marked ?? ""}
      className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface px-5 py-3"
    >
      <span className="min-w-[140px] flex-1 text-[16px] font-bold text-white">
        {booking.nickname}
        {/*
          THE PARTY IS PART OF THE NAME HERE (round 11), not a row of its own.
          A party is ONE booking: one attendance mark, one payment, one
          cancellation. Giving each guest its own row would put three
          attendance toggles where the organizer can only make one decision,
          and settle would have two of them permanently unanswered.
        */}
        {booking.guestCount > 0 && (
          <span
            data-testid="roster-party"
            data-guests={booking.guestCount}
            className="ml-2 align-middle text-[12px] font-semibold text-volt-dim"
          >
            {strings.admin.rosterParty.replace("{n}", String(booking.guestCount))}
          </span>
        )}
      </span>

      <PaymentBadge status={booking.status} method={booking.paymentMethod} />

      <span className="text-[10px] uppercase tracking-eyebrow text-faint">
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

      {/*
        REMOVE, LAST AND QUIETEST (round 16, item 17).

        On the row rather than in a section of its own, because it is the third
        thing an organizer decides about one person — did they turn up, did they
        pay, are they still coming — and the first two are already here.

        BEHIND A DIALOG, and the dialog says what happens to the money. Present
        and no-show are reversible by pressing the other one; this releases a
        seat and moves credit, and there is no button that puts it back.
      */}
      {canRemove && isActive && (
        <RemovePlayerControl booking={booking} gameId={gameId} />
      )}

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
      className={`rounded-control px-4 py-2 text-[13px] font-extrabold uppercase tracking-wide disabled:opacity-60 ${
        active
          ? "bg-volt text-surface"
          : "border border-hairline-strong bg-transparent text-bone"
      }`}
    >
      {label}
    </button>
  );
}
