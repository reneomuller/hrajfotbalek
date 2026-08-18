import { getStrings } from "@/lib/i18n/server";
import type { SkillLevel } from "@/lib/types/database";

/**
 * The level badge(s) on a restricted game.
 *
 * NULL RENDERS NOTHING, ANYWHERE (§5.3, REQ-GAME-009). An all-levels game is
 * the ordinary case and gets no badge at all — not a badge reading "all
 * levels", which would be a label on the absence of a restriction and would
 * make every game on the list look like it had a rule.
 *
 * The single test for that is `allowed_skill_levels is null`, and it is the
 * whole test: `normalize_skill_levels` in the database collapses the empty
 * array and the all-three array to NULL, so no render site has to hold an
 * opinion about what a full array means.
 *
 * DISPLAY AND SOCIAL SIGNALLING ONLY. `create_booking` never consults skill,
 * and a restricted game does not refuse a player who does not match
 * (REQ-GAME-011). This component exists so a Beginner can see that a game is
 * pitched at Advanced players before turning up to it, not so the product can
 * stop them coming.
 */
export async function SkillBadges({
  levels,
  size = "default",
}: {
  levels: SkillLevel[] | null;
  size?: "default" | "slim";
}) {
  const t = await getStrings();

  if (!levels || levels.length === 0) return null;

  /*
    SIZED TO `CardBadges`, WHICH IT SITS BESIDE.

    These were `text-[10px]`, uppercase, `tracking-[1px]`, `px-2` — while the
    format and surface badges on the same row of the same card are `text-body`
    at `px-3 py-1` in sentence case. Three facts about one game, rendered as
    two classes of object, with the restriction — the one that decides whether
    you may play at all — set smallest.

    So: the same padding, the same text size, the same weight, and the tracked
    capitals dropped. Ruling B left `eyebrow` as the product's only uppercase
    style and this was never an eyebrow.

    WHAT STAYS DIFFERENT is the fill. `hairline-volt` on `volt/[.08]` against
    the format badge's `border-volt` on `volt/[.12]`: same geometry, quieter
    ink. Making them identical would erase the difference between "this is a
    6v6" and "this game is restricted", which is the one distinction on the row
    that changes what a reader can do.
  */
  const text = size === "slim" ? "text-small" : "text-body";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="skill-badges">
      {levels.map((level) => (
        <span
          key={level}
          data-testid={`skill-badge-${level}`}
          className={`rounded-pill border border-hairline-volt bg-volt/[.08] px-3 py-1 ${text} font-semibold text-volt`}
        >
          {t.games.skillLevel[level]}
        </span>
      ))}
    </div>
  );
}
