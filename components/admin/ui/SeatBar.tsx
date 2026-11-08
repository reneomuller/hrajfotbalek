import { formatSeats, seatBar, type SeatBarInput, type SeatKind } from "@/lib/admin/seatBar";
import { strings } from "@/lib/strings";

/**
 * How full a game is, split by how each seat was paid, with a line at
 * break-even (round 42, the admin rebuild). One component for the games list,
 * the game page and the money page, so the three cannot draw it differently.
 *
 * The full-price seats are volt, the cheaper pass seats the dim volt, balance
 * Credits volt at half strength, seats that brought nothing bone at low
 * strength, and the unpaid ones warn — the one colour on the bar that asks
 * for something.
 */
const KIND_CLASS: Record<SeatKind, string> = {
  single: "bg-volt",
  pass: "bg-volt-dim",
  credit: "bg-volt/45",
  free: "bg-bone/30",
  house: "bg-bone/15",
  unpaid: "bg-warn",
};

export function SeatBar({
  game,
  seatsTaken,
  size = "sm",
  testId = "seat-bar",
}: {
  game: SeatBarInput;
  seatsTaken: number;
  size?: "sm" | "lg";
  testId?: string;
}) {
  const bar = seatBar(game);
  const label = strings.admin.seatBarLabel
    .replace("{taken}", formatSeats(seatsTaken))
    .replace("{capacity}", String(game.capacity));

  return (
    <div
      role="img"
      aria-label={
        game.breakEvenSeats === null
          ? label
          : `${label}. ${strings.admin.breakEvenAt.replace("{n}", String(game.breakEvenSeats))}`
      }
      data-testid={testId}
      data-past-break-even={bar.pastBreakEven ? "true" : "false"}
      className={`relative w-full ${size === "lg" ? "h-3" : "h-[6px]"}`}
    >
      <div className="flex h-full w-full overflow-hidden rounded-pill bg-surface-seg">
        {bar.segments.map((segment) => (
          <div
            key={segment.kind}
            data-kind={segment.kind}
            className={`h-full ${KIND_CLASS[segment.kind]}`}
            /* The width is the data — the one inline style the rule allows. */
            style={{ width: `${segment.percent}%` }}
          />
        ))}
      </div>
      {bar.breakEvenPercent !== null && (
        <div
          aria-hidden
          data-testid={`${testId}-break-even`}
          className="absolute -bottom-[3px] -top-[3px] w-[2px] -translate-x-1/2 rounded-pill bg-bone"
          style={{ left: `${bar.breakEvenPercent}%` }}
        />
      )}
    </div>
  );
}

/** The key under a large seat bar: each kind that is present, and how many. */
export function SeatLegend({ game }: { game: SeatBarInput }) {
  const bar = seatBar(game);
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {bar.segments.map((segment) => (
        <li key={segment.kind} data-kind={segment.kind} className="flex items-center gap-[6px]">
          <span aria-hidden className={`h-2 w-2 rounded-pill ${KIND_CLASS[segment.kind]}`} />
          {strings.admin.seatKinds[segment.kind]} {formatSeats(segment.seats)}
        </li>
      ))}
      {game.breakEvenSeats !== null && (
        <li className="flex items-center gap-[6px]">
          <span aria-hidden className="h-3 w-[2px] rounded-pill bg-bone" />
          {strings.admin.breakEvenAt.replace("{n}", String(game.breakEvenSeats))}
        </li>
      )}
    </ul>
  );
}
