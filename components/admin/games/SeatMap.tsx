import { Panel } from "@/components/admin/ui/Panel";
import { SeatBar, SeatLegend } from "@/components/admin/ui/SeatBar";
import type { SeatCell, SeatCellKind } from "@/lib/admin/games/seatGrid";
import { formatSeats, type SeatBarInput } from "@/lib/admin/seatBar";
import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";

const hub = strings.admin.gamesHub;

/**
 * THE SAME COLOURS AS THE SEAT BAR'S SEGMENTS, so the grid reads as the bar
 * folded into seats. `components/admin/ui/SeatBar.tsx` keeps its map private;
 * this one must change with it (and an `open` seat is the grid's alone).
 */
const DOT: Record<SeatCellKind, string> = {
  single: "bg-volt text-ink",
  pass: "bg-volt-dim text-ink",
  credit: "bg-volt/45 text-ink",
  free: "bg-bone/30 text-white",
  house: "bg-bone/15 text-bone",
  unpaid: "bg-warn text-ink",
  open: "border border-dashed border-hairline-strong",
};

function describe(cell: SeatCell): string {
  const n = String(cell.number);
  if (cell.kind === "open") return hub.seatOpen.replace("{n}", n);
  const kind = strings.admin.seatKinds[cell.kind];
  if (!cell.nickname) return hub.seatHouse.replace("{n}", n).replace("{kind}", kind);
  const template = cell.isGuest ? hub.seatGuestOf : hub.seatTaken;
  return template.replace("{n}", n).replace("{name}", cell.nickname).replace("{kind}", kind);
}

/**
 * The game's seats (round 42, the admin rebuild): the large seat bar with its
 * break-even line and key, and under it one dot per seat — who holds it, and
 * how it was paid. The holder's own seat carries their initials; the friends
 * they brought are the same colour, unlabelled, and say so to a screen reader.
 */
export function SeatMap({
  bar,
  seatsTaken,
  cells,
}: {
  bar: SeatBarInput;
  seatsTaken: number;
  cells: SeatCell[];
}) {
  const open = cells.filter((cell) => cell.kind === "open").length;

  return (
    <Panel
      title={hub.seatMapTitle}
      testId="game-seat-map"
      action={
        <span className="text-small font-semibold tabular-nums text-white">
          {formatSeats(seatsTaken)}/{bar.capacity}
        </span>
      }
    >
      <SeatBar game={bar} seatsTaken={seatsTaken} size="lg" testId="game-seat-bar" />
      <SeatLegend game={bar} />

      <ul
        aria-label={hub.seatMapLabel}
        data-testid="seat-grid"
        className="mt-4 grid list-none grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-[6px] p-0"
      >
        {cells.map((cell) => {
          const label = describe(cell);
          return (
            <li
              key={cell.key}
              data-testid="seat-cell"
              data-kind={cell.kind}
              data-booking-id={cell.bookingId ?? undefined}
              title={label}
              className={`flex aspect-square items-center justify-center rounded-pill text-[11px] font-bold ${DOT[cell.kind]}`}
            >
              <span aria-hidden>{cell.nickname && !cell.isGuest ? initials(cell.nickname) : null}</span>
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ul>

      {open > 0 && (
        <p className="mt-3 flex items-center gap-[6px] text-[12px] text-muted">
          <span aria-hidden className="h-2 w-2 rounded-pill border border-dashed border-hairline-strong" />
          {hub.openSeats.replace("{n}", String(open))}
        </p>
      )}
    </Panel>
  );
}
