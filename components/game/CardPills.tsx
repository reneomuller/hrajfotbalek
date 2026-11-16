import { Icon } from "@/components/Icon";
import { LanguagePill } from "@/components/game/LanguagePill";
import type { GameLanguage } from "@/lib/games/language";
import { getStrings } from "@/lib/i18n/server";

/**
 * The game card's top-right pills — the owner's mock, 2026-11-16.
 *
 *   [👥 6v6] (🌐 | 🇨🇿 🇬🇧)
 *              (⌂ Indoor)
 *
 * THE CARD'S OWN, NOT `CardBadges`. The detail page keeps the outlined format
 * badge beside the surface word in its fact list; the card draws what the mock
 * draws: a SOLID volt format pill with a team mark, the flags gathered into
 * one outlined pill behind a globe, and indoor or outdoor in a small pill
 * centred under them. Ruling 6's tinted format chip was the card's for three
 * months; the owner's mock is the later word.
 *
 * INDOOR OR OUTDOOR HANGS, IT DOES NOT STACK. The pill sits below the language
 * pill without adding to the row's height, because the card's height is what
 * the venue photo's crop is pinned to (`1600x740`, see CLAUDE.md) — a card that
 * grew whenever the admin said "Indoor" would crop its photograph differently
 * from the one beside it. The row reserves the height the old 34px flags had,
 * and the hanging pill ends above the spots figure on the row beneath.
 *
 * ABSENT UNTIL SAID. `games.indoor` is null for every game the admin has not
 * answered for, and `undefined` before the migration; neither draws a pill.
 */
export async function CardPills({
  format,
  language,
  indoor,
}: {
  format: string | null;
  language: GameLanguage;
  indoor?: boolean | null;
}) {
  const t = await getStrings();
  const setting = indoor === true ? "indoor" : indoor === false ? "outdoor" : null;

  return (
    <span data-testid="card-badges" className="flex min-h-[34px] shrink-0 items-start gap-1">
      {format && (
        <span
          data-testid="game-format"
          className="inline-flex h-7 items-center gap-1 rounded-pill bg-volt px-2.5 text-body font-bold text-ink"
        >
          <Icon name="team" className="h-4 w-4" />
          {format}
        </span>
      )}

      <span className="relative flex flex-col items-center">
        <span
          data-testid="card-language"
          className="inline-flex h-7 items-center gap-1 rounded-pill border border-bone/60 bg-ink/70 px-2"
        >
          <Icon name="globe" className="h-[15px] w-[15px] text-bone" strokeWidth={2} />
          <span aria-hidden className="mx-px h-3.5 w-px bg-bone/50" />
          <LanguagePill language={language} size="card" />
        </span>

        {setting && (
          <span
            data-testid="card-setting"
            data-setting={setting}
            className="absolute left-1/2 top-full mt-[3px] inline-flex h-4 -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-pill border border-bone/60 bg-ink/70 px-2 text-[10px] font-semibold leading-none text-bone"
          >
            <Icon name={setting} className="h-2.5 w-2.5" strokeWidth={2.2} />
            {t.games.setting[setting]}
          </span>
        )}
      </span>
    </span>
  );
}
