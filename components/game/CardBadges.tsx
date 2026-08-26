import { LanguagePill } from "@/components/game/LanguagePill";
import type { GameLanguage } from "@/lib/games/language";
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
 *
 * GEOMETRY COMES FROM `.badge-pill` (round 8, item 6) — height, padding,
 * radius, type size and border width, written once in globals.css. This file
 * chooses INK and nothing else. The `size` prop is gone: the list and the
 * detail rendered the same badge at two sizes, and on the detail page it sat
 * beside a skill badge at a third.
 *
 * THE VOLT PILL DOES NOT, and deliberately. `.lifted` is the NEUTRAL surface
 * treatment; the format badge is the card's accent and its colour is the whole
 * of what it says. Folding it in would make the two badges identical and lose
 * the hierarchy the two-colour split above exists to draw. Same geometry, same
 * padding, same radius — different ink.
 */
export async function CardBadges({
  format,
  surface,
  language,
}: {
  format: string | null;
  /**
   * Rendered only when no `language` is given (round 18, item 2).
   *
   * THE SURFACE PILL LEFT THE LIST CARD. It answers "what am I playing on",
   * which is a thing you check once when you decide to come; the LANGUAGE
   * answers "will I be able to talk to anyone", which is what somebody
   * scanning a list of games is actually filtering on. Two secondary pills
   * beside the format badge is one more than the row can carry at 390px, so
   * the card takes the one that decides whether you tap.
   *
   * Surface is not lost — it moved to the game detail, where the fact list has
   * room to state it in full. Round 18 item 2.
   */
  surface: GameSurface | null;
  /**
   * The game's language pair. Present on the list card, absent on the detail's
   * fact list — which is what selects between the two pills above.
   */
  language?: GameLanguage;
}) {
  const t = await getStrings();
  if (!format && !surface && !language) return null;

  return (
    <div data-testid="card-badges" className="flex shrink-0 flex-wrap items-center gap-1">
      {format && (
        <span
          data-testid="game-format"
          className="badge-pill border-volt bg-volt/[.12] text-volt"
        >
          {format}
        </span>
      )}
      {/*
        ONE SECONDARY PILL, AND WHICH ONE DEPENDS ON THE SURFACE IT IS ON. The
        list card passes `language` and gets flags; the detail's fact list
        passes `surface` and gets the word. Never both — see the `surface` prop.
      */}
      {language ? (
        <LanguagePill language={language} />
      ) : (
        surface && (
          <span
            data-testid="game-surface"
            className="badge-pill border-hairline-strong bg-surface-raised text-bone"
          >
            {t.games.surface[surface]}
          </span>
        )
      )}
    </div>
  );
}
