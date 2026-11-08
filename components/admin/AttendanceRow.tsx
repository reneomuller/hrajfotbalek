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
import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";

const INITIAL: AttendanceState = { status: "idle" };

/**
 * One roster row: who, how they paid, whether they turned up — and, last and
 * quietest, remove.
 *
 * The payment badge sits beside the attendance controls deliberately: the two
 * questions the organizer is answering at close-out are "did they turn up" and
 * "did they pay", and settle is blocked on the second one.
 *
 * ROUND 42 LAYOUT: the person (an initials disc, the name, the party, the
 * badge) on the left; a two-button segment for present / no-show on the right,
 * so a column of rows reads like a register. Stacked under 768px, one line
 * from `md`.
 */
export function AttendanceRow({
  booking,
  gameId,
  canRemove = false,
  canChooseCredit = false,
}: {
  booking: AdminBookingRow;
  gameId: string;
  /**
   * Whether this database can release a seat (round 16, item 17). False hides
   * the control rather than offering a 404.
   */
  canRemove?: boolean;
  /** Round 42 — the remove dialog offers the Credit switch. */
  canChooseCredit?: boolean;
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
      className="grid gap-3 rounded-card bg-surface px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface-seg text-[12px] font-bold text-bone"
        >
          {initials(booking.nickname)}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            {/* Player-supplied free text; JSX escapes it. */}
            <span className="truncate text-body font-bold text-white">{booking.nickname}</span>
            {/*
              THE PARTY IS PART OF THE NAME (round 11), not a row of its own. A
              party is ONE booking: one attendance mark, one payment, one
              cancellation.
            */}
            {booking.guestCount > 0 && (
              <span
                data-testid="roster-party"
                data-guests={booking.guestCount}
                className="text-[12px] font-semibold text-volt-dim"
              >
                {strings.admin.rosterParty.replace("{n}", String(booking.guestCount))}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PaymentBadge status={booking.status} method={booking.paymentMethod} />
            <span className="text-[10px] uppercase tracking-eyebrow text-faint">
              {marked === "present"
                ? strings.admin.markPresent
                : marked === "no_show"
                  ? strings.admin.markNoShow
                  : strings.admin.attendanceUnmarked}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <form
          action={formAction}
          className="inline-flex rounded-control border border-hairline-strong p-[3px]"
        >
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="gameId" value={gameId} />
          <MarkButton
            value="present"
            label={strings.admin.markPresent}
            active={marked === "present"}
            activeClass="bg-volt text-ink"
            testId="mark-present"
          />
          <MarkButton
            value="no_show"
            label={strings.admin.markNoShow}
            active={marked === "no_show"}
            activeClass="bg-danger text-ink"
            testId="mark-no-show"
          />
        </form>

        {/*
          REMOVE, LAST AND QUIETEST (round 16, item 17), behind a dialog that
          says what happens to the money: present and no-show undo each other;
          this releases a seat and there is no button that puts it back.
        */}
        {canRemove && isActive && (
          <RemovePlayerControl booking={booking} gameId={gameId} canChooseCredit={canChooseCredit} />
        )}
      </div>

      {state.status === "error" && state.message && (
        <span role="alert" className="text-[12px] text-muted md:col-span-2">
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
  activeClass,
  testId,
}: {
  value: string;
  label: string;
  active: boolean;
  activeClass: string;
  testId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="attendance"
      value={value}
      disabled={pending}
      aria-pressed={active}
      data-testid={testId}
      className={`min-h-10 rounded-[11px] px-4 text-[12px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-60 ${
        active ? activeClass : "bg-transparent text-muted hover:text-bone"
      }`}
    >
      {label}
    </button>
  );
}
