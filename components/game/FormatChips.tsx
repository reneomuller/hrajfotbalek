import { strings } from "@/lib/strings";
import type { GameSurface } from "@/lib/types/database";

/**
 * The `6v6 · TURF` pair from the design reference — a filled volt chip for the
 * format and an outlined one for the surface.
 *
 * The reference renders them as one baked string; they are two columns here, so
 * they are two chips and either can be absent. A game whose organizer said
 * nothing shows nothing rather than a placeholder.
 *
 * THE DERIVED FORMAT IS A FALLBACK, NOT A GUESS AT THE TRUTH. `capacity / 2`
 * is right for a game with no substitutes and wrong for one with them, so it
 * only ever fills in where the organizer left the field empty, and never
 * overrides what they actually wrote. An odd capacity yields nothing at all,
 * because "6.5v6.5" is not a format and rounding it would invent a fact.
 */
export function FormatChips({
  format,
  surface,
  capacity,
  size = "default",
}: {
  format: string | null;
  surface: GameSurface | null;
  /** Used only to derive a format when the organizer gave none. */
  capacity?: number;
  size?: "default" | "slim";
}) {
  const perSide =
    capacity !== undefined && capacity > 0 && capacity % 2 === 0 ? capacity / 2 : null;
  const formatLabel = format ?? (perSide !== null ? `${perSide}v${perSide}` : null);

  if (!formatLabel && !surface) return null;

  const text = size === "slim" ? "text-[9px]" : "text-[10px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {formatLabel && (
        <span
          data-testid="game-format"
          className={`rounded-chip bg-volt px-2 py-1 font-mono ${text} font-bold tracking-[1px] text-surface`}
        >
          {formatLabel}
        </span>
      )}
      {surface && (
        <span
          data-testid="game-surface"
          className={`rounded-chip border border-hairline-strong px-2 py-1 font-mono ${text} font-bold uppercase tracking-[1px] text-muted`}
        >
          {strings.games.surface[surface]}
        </span>
      )}
    </div>
  );
}
