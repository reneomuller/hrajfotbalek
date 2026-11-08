"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  markAttendanceAction,
  type AttendanceState,
} from "@/app/admin/games/[id]/attendance/actions";
import type { AdminPlayerGameRow } from "@/lib/admin/queries";
import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

const INITIAL: AttendanceState = { status: "idle" };

const ATTENDANCE_TONE = {
  no_show: "border-danger/60 text-danger",
  present: "border-hairline-volt text-volt",
  unmarked: "border-hairline-strong text-faint",
} as const;

/** What the row's pill says: the mark, or why there is none. */
function attendanceLabel(row: AdminPlayerGameRow, isActive: boolean): string {
  if (row.attendance === "present") return strings.admin.markPresent;
  if (row.attendance === "no_show") return strings.admin.markNoShow;
  if (isActive) return strings.admin.attendanceUnmarked;
  return strings.admin.status[row.status === "cancelled" ? "cancelled" : "draft"];
}

/**
 * One game in a player's history, with the no-show control (REQ-ADMIN-002).
 *
 * THE SAME `mark_attendance` RPC THE GAME ROSTER CALLS. Contract §7 asks for
 * the control in both places, and the requirement worth stating is that they
 * are two surfaces onto ONE write — not two implementations that must agree.
 * The organizer marks a no-show wherever they happen to be looking, and the
 * booking ends up in the same state either way.
 *
 * OFFERED ONLY FOR A GAME THAT HAS ALREADY KICKED OFF, mirroring the RPC:
 * attendance on a future game is a statement nobody can make yet. The RPC
 * remains the authority and refuses it regardless of what renders here.
 *
 * ROUND 42: rows of one panel rather than a stack of cards, the state as a
 * pill, and the two marks as chips — the one already recorded drawn as chosen.
 */
export function PlayerAttendanceRow({ row }: { row: AdminPlayerGameRow }) {
  const [state, formAction] = useActionState(markAttendanceAction, INITIAL);

  // `hasStarted` arrives from the query layer, where the clock is read once
  // per request. Reading it here would be impure and would let a server render
  // and its hydration disagree about whether a game has begun.
  const isActive = row.status === "reserved" || row.status === "confirmed";
  const canMark = isActive && row.hasStarted;

  const label = attendanceLabel(row, isActive);
  const tone = ATTENDANCE_TONE[row.attendance ?? "unmarked"];

  return (
    <li
      data-testid="player-game-row"
      data-attendance={row.attendance ?? ""}
      data-status={row.status}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0 first:pt-0"
    >
      <div className="min-w-[180px] flex-1">
        <Link
          href={`/admin/games/${row.gameId}`}
          className="text-body font-bold text-white no-underline transition-colors hover:text-volt"
        >
          {row.venue}
        </Link>
        <div className="text-[12px] tabular-nums text-muted">
          {row.startsAt ? formatGameDateTime(row.startsAt) : "—"}
        </div>
      </div>

      <span
        data-testid="player-game-attendance"
        className={`shrink-0 rounded-pill border px-2 py-[2px] text-[9px] uppercase leading-normal tracking-eyebrow ${tone}`}
      >
        {label}
      </span>

      {canMark && (
        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="bookingId" value={row.bookingId} />
          <input type="hidden" name="gameId" value={row.gameId} />
          <MarkButton value="present" label={strings.admin.markPresent} chosen={row.attendance === "present"} />
          <MarkButton value="no_show" label={strings.admin.markNoShow} chosen={row.attendance === "no_show"} />
        </form>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="m-0 w-full text-[12px] text-danger">
          {state.message}
        </p>
      )}
    </li>
  );
}

function MarkButton({
  value,
  label,
  chosen,
}: {
  value: "present" | "no_show";
  label: string;
  chosen: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="attendance"
      value={value}
      disabled={pending}
      aria-pressed={chosen}
      data-testid={`player-mark-${value === "no_show" ? "no-show" : "present"}`}
      className={`inline-flex min-h-11 items-center rounded-pill border px-3 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
        chosen ? "border-volt text-volt" : "border-hairline-strong text-bone hover:border-volt hover:text-volt"
      }`}
    >
      {label}
    </button>
  );
}
