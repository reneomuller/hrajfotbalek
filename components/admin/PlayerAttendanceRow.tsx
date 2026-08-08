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
 */
export function PlayerAttendanceRow({ row }: { row: AdminPlayerGameRow }) {
  const [state, formAction] = useActionState(markAttendanceAction, INITIAL);

  // `hasStarted` arrives from the query layer, where the clock is read once
  // per request. Reading it here would be impure and would let a server render
  // and its hydration disagree about whether a game has begun.
  const isActive = row.status === "reserved" || row.status === "confirmed";
  const canMark = isActive && row.hasStarted;

  return (
    <li
      data-testid="player-game-row"
      data-attendance={row.attendance ?? ""}
      data-status={row.status}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-surface px-5 py-3"
    >
      <div className="min-w-[180px] flex-1">
        <Link
          href={`/admin/games/${row.gameId}`}
          className="text-[16px] font-bold text-white no-underline"
        >
          {row.venue}
        </Link>
        <div className="text-[11px] tracking-[1px] text-muted">
          {row.startsAt ? formatGameDateTime(row.startsAt) : "—"}
        </div>
      </div>

      <span
        data-testid="player-game-attendance"
        className={` text-[10px] uppercase tracking-eyebrow ${
          row.attendance === "no_show" ? "text-volt" : "text-faint"
        }`}
      >
        {row.attendance === "present"
          ? strings.admin.markPresent
          : row.attendance === "no_show"
            ? strings.admin.markNoShow
            : isActive
              ? strings.admin.attendanceUnmarked
              : strings.admin.status[row.status === "cancelled" ? "cancelled" : "draft"]}
      </span>

      {canMark && (
        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="bookingId" value={row.bookingId} />
          <input type="hidden" name="gameId" value={row.gameId} />
          <MarkButton value="present" label={strings.admin.markPresent} />
          <MarkButton value="no_show" label={strings.admin.markNoShow} />
        </form>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="w-full text-[12px] text-muted">
          {state.message}
        </p>
      )}
    </li>
  );
}

function MarkButton({ value, label }: { value: "present" | "no_show"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="attendance"
      value={value}
      disabled={pending}
      data-testid={`player-mark-${value === "no_show" ? "no-show" : "present"}`}
      className="rounded-control border border-hairline-strong px-3 py-2 text-[10px] uppercase tracking-eyebrow text-bone disabled:opacity-50"
    >
      {label}
    </button>
  );
}
