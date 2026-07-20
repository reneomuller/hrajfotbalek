import { strings } from "@/lib/strings";

export interface SpotsCounterProps {
  capacity: number;
  bookedCount: number;
}

/**
 * Spots-left counter.
 *
 * Both numbers are computed server-side by `lib/games/queries.ts` and passed
 * in as props — this component does no fetching and holds no state. A
 * client-computed counter drifts from the roster it is meant to summarize;
 * a server-computed one can only be stale, which is recoverable.
 */
export function SpotsCounter({ capacity, bookedCount }: SpotsCounterProps) {
  const spotsLeft = Math.max(0, capacity - bookedCount);
  const isFull = spotsLeft === 0;
  const taken = Math.min(bookedCount, capacity);

  return (
    <div className="rounded-card border border-hairline-volt bg-surface-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div
          className="font-display text-[44px] leading-none text-volt"
          data-testid="spots-left"
        >
          {isFull ? strings.games.full : spotsLeft}
        </div>
        <div className="font-mono text-[11px] tracking-[1px] text-muted">
          {taken} / {capacity}
        </div>
      </div>

      {!isFull && (
        <div className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-volt-dim">
          {spotsLeft === 1 ? strings.games.spotLeft : strings.games.spotsLeft}
        </div>
      )}

      {/* Capacity bar — purely decorative, mirrors the numbers above. */}
      <div
        aria-hidden
        className="mt-4 h-[6px] w-full overflow-hidden rounded-chip bg-hairline"
      >
        <div
          className="h-full rounded-chip bg-volt"
          style={{ width: `${capacity > 0 ? (taken / capacity) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
