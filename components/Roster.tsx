import { strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];

export interface RosterProps {
  rows: Pick<RosterRow, "nickname" | "status">[];
}

/**
 * Public lineup.
 *
 * PII BOUNDARY — the single highest-risk surface in the product. The rows
 * arrive from `game_roster_public`, which projects `game_id`, `nickname` and
 * `status` and nothing else. This component's prop type is deliberately
 * narrowed to `nickname` + `status` so that even if the view were widened
 * later, no additional field could reach the rendered markup (and therefore
 * the RSC payload) without someone changing this type on purpose.
 *
 * `nickname` is player-supplied and is interpolated as a JSX text child, which
 * React escapes.
 */
export function Roster({ rows }: RosterProps) {
  return (
    <section className="mt-8">
      <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
        {strings.games.rosterTitle}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.rosterEmpty}
        </p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-px p-0" data-testid="roster">
          {rows.map((row, i) => (
            <li
              key={`${row.nickname}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-hairline py-[10px] last:border-b-0"
            >
              <span className="text-[14px] text-bone">{row.nickname}</span>
              <span
                className={`font-mono text-[10px] uppercase tracking-eyebrow ${
                  row.status === "confirmed" ? "text-volt" : "text-faint"
                }`}
              >
                {row.status === "confirmed"
                  ? strings.games.rosterConfirmed
                  : strings.games.rosterReserved}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
