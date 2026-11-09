import { PaymentBadge } from "@/components/admin/PaymentBadge";
import { RemovePlayerControl } from "@/components/admin/RemovePlayerControl";
import type { AdminBookingRow } from "@/lib/admin/queries";
import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";

/**
 * One roster row: who, how they paid — and, last and quietest, remove.
 *
 * ~~Whether they turned up~~ — the present / no-show segment is gone (the
 * owner, 2026-11-09: "let's remove the 'present' and 'no-show' function from
 * the web completely"). A game is played once it finishes; nobody marks who
 * came. The file was `AttendanceRow` until then.
 *
 * The person (an initials disc, the name, the party, the payment badge) on the
 * left, remove on the right. Stacked under 768px, one line from `md`.
 */
export function RosterRow({
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
  // Only a live seat can be released. A cancelled row is already released.
  const isActive = booking.status === "reserved" || booking.status === "confirmed";

  return (
    <li
      data-testid="roster-row"
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
              party is ONE booking: one payment, one cancellation.
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
          </div>
        </div>
      </div>

      {/*
        REMOVE, LAST AND QUIETEST (round 16, item 17), behind a dialog that
        says what happens to the money: this releases a seat and there is no
        button that puts it back.
      */}
      {canRemove && isActive && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <RemovePlayerControl booking={booking} gameId={gameId} canChooseCredit={canChooseCredit} />
        </div>
      )}
    </li>
  );
}
