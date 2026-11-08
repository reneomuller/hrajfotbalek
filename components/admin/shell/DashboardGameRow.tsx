import Link from "next/link";
import { SeatBar } from "@/components/admin/ui/SeatBar";
import type { DashboardGameRow as Row } from "@/lib/admin/dashboard";
import { formatSeats } from "@/lib/admin/seatBar";
import { breakEvenNote, rowSeatBarInput } from "@/lib/admin/shell/dashboardRows";
import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * One upcoming game on the dashboard (p14's row, round 42's seat bar).
 *
 * `venue` / `date · format · organizer` on the left and `booked / capacity`
 * with the status on the right, as p14 draws it — then the seat bar under the
 * whole row, so how full the pitch is reads at a glance down the list rather
 * than as six numbers to compare.
 *
 * THE BAR IS THE GAMES LIST'S BAR. A plain fill until pitch costs exist; once
 * `app_capabilities()` says `pitchCosts`, the split by how each seat was paid
 * and the line at break-even, with a line saying how far off it the game is.
 */
export function DashboardGameRow({ row }: { row: Row }) {
  const note = breakEvenNote(row);
  /*
   * p14 colours the status rather than greying it: volt for a game that is on
   * (`Confirmed`, `Waitlist`), muted for anything else — a developer reading a
   * row that should not be here.
   */
  const live = row.status === "published" || row.status === "full";

  return (
    <Link
      href={`/admin/games/${row.id}`}
      data-testid="dashboard-game-row"
      className="block py-3 no-underline"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-body font-semibold text-white">{row.venue}</div>
          <div className="truncate text-small text-muted">
            {[formatGameDateTime(row.startsAt), row.format, row.organizer]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {/*
            `booked / capacity` — the one number that decides whether an
            organizer has to do anything about this game today.
          */}
          <div className="text-body font-bold tabular-nums text-volt">
            <span data-testid="dashboard-game-capacity">
              {row.booked} / {row.capacity}
            </span>
          </div>
          <div className={`text-small font-semibold ${live ? "text-volt" : "text-muted"}`}>
            {strings.admin.dashboardStatus[row.status] ?? row.status}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <SeatBar game={rowSeatBarInput(row)} seatsTaken={row.booked} testId="dashboard-seat-bar" />
      </div>

      {note && (
        <p
          data-testid="dashboard-break-even"
          className={`m-0 mt-2 text-[12px] ${note.kind === "past" ? "text-volt-dim" : "text-faint"}`}
        >
          {note.kind === "past"
            ? strings.admin.shell.breakEvenPast
            : strings.admin.shell.breakEvenShort.replace("{n}", formatSeats(note.seats))}
        </p>
      )}
    </Link>
  );
}
