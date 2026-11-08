import Link from "next/link";
import type { DashboardTile as Tile } from "@/lib/admin/shell/dashboardView";

/**
 * One dashboard figure (round 8's p14 tile, round 42's third line).
 *
 * THE LABEL, THE FIGURE, AND WHAT IT COUNTS. The first two are p14's — the
 * label in a dimmed volt at 1.5px tracking so "NEW PLAYERS (7D)" stays on one
 * line in a half-width tile, the figure in Anton at 32px. The third is new:
 * "Total players" meant two different numbers on two pages, and a tile that
 * says what it counts cannot be read as the other one.
 *
 * The label and the figure stay the tile's first two `div`s, which is the
 * shape the dashboard specs read their type steps from.
 */
export function DashboardTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      data-testid={tile.testId}
      className="lifted flex min-w-0 flex-col rounded-card p-4 no-underline transition-colors hover:border-hairline-volt active:border-hairline-volt"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-volt/80">
        {tile.label}
      </div>
      <div className="mt-3 whitespace-nowrap font-display text-[32px] leading-none tabular-nums text-volt">
        {tile.value}
        {tile.unit && <span className="ml-1 text-[15px] tracking-wide">{tile.unit}</span>}
      </div>
      <p className="m-0 mt-auto pt-3 text-[11px] leading-snug text-muted">{tile.detail}</p>
    </Link>
  );
}
