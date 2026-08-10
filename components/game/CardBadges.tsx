import { getStrings } from "@/lib/i18n/server";
import type { GameSurface } from "@/lib/types/database";

/**
 * The format and surface BADGES — top-right of a list card (ruling 6,
 * 2026-08-10).
 *
 * They returned from an inline `6v6 • Turf` text line, which buried two facts
 * a reader scans for in a sentence they have to read. Pre-v1.3 these were
 * chips, and the ruling restores that treatment: a pill with a SEMI-TRANSPARENT
 * FILL and a SOLID COLOURED OUTLINE, rather than the solid-volt chip the old
 * format badge used. The tint carries the colour without competing with the
 * spots figure, which remains the card's one accent (ruling D).
 *
 * TWO COLOURS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. Format is the kind of
 * football — the thing someone filters on — and takes the volt. Surface is
 * where it is played, a secondary fact, and takes bone. Giving both volt would
 * make the pair a block of colour with no hierarchy inside it.
 *
 * NEITHER IS INVENTED. A game whose organizer recorded no format shows no
 * format badge — v1.1.2 §5.3a rules against deriving one from capacity, and a
 * "6v6" printed from `capacity / 2` is a confident falsehood on a public page.
 *
 * The surface label is the TRANSLATED token (`games.surface.*`), never an
 * English string invented at the render site.
 */
export async function CardBadges({
  format,
  surface,
  size = "default",
}: {
  format: string | null;
  surface: GameSurface | null;
  /** `slim` is the list card; `default` is the game card's larger row. */
  size?: "default" | "slim";
}) {
  const t = await getStrings();
  if (!format && !surface) return null;

  const text = size === "slim" ? "text-[10px]" : "text-small";
  const pad = size === "slim" ? "px-2 py-[2px]" : "px-3 py-1";

  return (
    <div data-testid="card-badges" className="flex shrink-0 flex-wrap items-center gap-1">
      {format && (
        <span
          data-testid="game-format"
          className={`rounded-pill border border-volt bg-volt/[.12] ${pad} ${text} font-semibold text-volt`}
        >
          {format}
        </span>
      )}
      {surface && (
        <span
          data-testid="game-surface"
          className={`rounded-pill border border-hairline-strong bg-bone/[.06] ${pad} ${text} font-semibold text-bone`}
        >
          {t.games.surface[surface]}
        </span>
      )}
    </div>
  );
}
