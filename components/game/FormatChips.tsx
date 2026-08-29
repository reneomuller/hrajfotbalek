import { getLocale, getStrings } from "@/lib/i18n/server";
import { pluralise } from "@/lib/i18n/plural";
import type { GameSurface } from "@/lib/types/database";

/**
 * The `6v6 · 2 SUBS PER TEAM · TURF` row — a filled volt chip for the format,
 * plain text for the substitutes, an outlined chip for the surface.
 *
 * THE FORMAT IS NEVER DERIVED FROM CAPACITY, IN EITHER DIRECTION.
 *
 * This component used to fall back to `capacity / 2` when the organizer left
 * the format empty, on the reasoning that a derived value beats nothing.
 * Contract v1.1.2 §5.3a rules against exactly that, and the ruling is right: a
 * 12-capacity game may be 5v5 with two substitutes a side, or 6v6 with two
 * people who asked to be listed. "6v6" printed from the number is not a
 * fallback, it is a confident falsehood on a public page — and unlike a blank,
 * nobody can tell it is wrong by looking at it.
 *
 * `capacity` was therefore REMOVED as a prop rather than left unused: a
 * component that still accepts it is a component someone will use it in.
 *
 * A game whose organizer said nothing shows nothing. That is a complete
 * answer, not a gap.
 */
export async function FormatChips({
  format,
  surface,
  subsPerTeam = null,
  size = "default",
}: {
  format: string | null;
  surface: GameSurface | null;
  /** Renders beside the format when set, and nothing when null (§5.3a). */
  subsPerTeam?: number | null;
  size?: "default" | "slim";
}) {
  const t = await getStrings();

  if (!format && !surface && subsPerTeam === null) return null;

  const text = size === "slim" ? "text-[9px]" : "text-[10px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {format && (
        <span
          data-testid="game-format"
          className={`rounded-pill bg-volt px-2 py-1 ${text} font-bold tracking-[1px] text-surface`}
        >
          {format}
        </span>
      )}
      {subsPerTeam !== null && (
        <span
          data-testid="game-subs"
          className={` ${text} uppercase tracking-[1px] text-muted`}
        >
          {pluralise(
            {
              one: t.games.subsPerTeamOne,
              few: t.games.subsPerTeamFew,
              many: t.games.subsPerTeamMany,
            },
            subsPerTeam,
            await getLocale(),
          )}
        </span>
      )}
      {surface && (
        <span
          data-testid="game-surface"
          className={`rounded-pill border border-hairline-strong px-2 py-1 ${text} font-bold uppercase tracking-[1px] text-muted`}
        >
          {t.games.surface[surface]}
        </span>
      )}
    </div>
  );
}
