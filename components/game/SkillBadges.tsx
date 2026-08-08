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

  const text = size === "slim" ? "text-[9px]" : "text-[10px]";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="skill-badges">
      {levels.map((level) => (
        <span
          key={level}
          data-testid={`skill-badge-${level}`}
          className={`rounded-pill border border-hairline-volt bg-volt/[.08] px-2 py-1 ${text} font-bold uppercase tracking-[1px] text-volt`}
        >
          {t.games.skillLevel[level]}
        </span>
      ))}
    </div>
  );
}
