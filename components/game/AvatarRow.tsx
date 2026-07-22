import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";

/**
 * Overlapping initial avatars, from the design reference's `data-roster` block:
 * 34px circles, `margin-left:-8px`, a 2px `#0D0D0D` ring so they read as a
 * stack, and every third one in volt to break the monotony.
 *
 * PII: nicknames only. These render on surfaces an anonymous visitor can see,
 * so the rows behind them must come from `game_roster_public` or
 * `game_waitlist_public` — never from `bookings` or `waitlist` directly.
 * `nickname` is player-supplied free text interpolated as a JSX child, which
 * React escapes.
 *
 * `highlight` marks the viewer's own entry with a volt ring. It is a DISPLAY
 * decision made by the caller from its own session — the views project no
 * player id, and deliberately so, which means "which of these is me" can only
 * be answered by matching the viewer's own nickname. That is fine for a ring
 * and would not be fine for anything that mattered.
 */
export function AvatarRow({
  names,
  highlight,
  max = 12,
  size = "default",
}: {
  names: string[];
  /** Nickname to ring as the viewer's own, if present. */
  highlight?: string | null;
  /** Beyond this, a "+N" chip stands in for the tail. */
  max?: number;
  size?: "default" | "slim";
}) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  const dim = size === "slim" ? "h-[26px] w-[26px] text-[11px]" : "h-[34px] w-[34px] text-[13px]";

  return (
    <div className="flex flex-wrap items-center gap-y-[6px]">
      {shown.map((nickname, i) => {
        const isYou = highlight != null && nickname === highlight;
        return (
          <span
            key={`${nickname}-${i}`}
            title={isYou ? `${nickname} — ${strings.games.waitlistYou}` : nickname}
            data-testid={isYou ? "avatar-you" : "avatar"}
            className={`-ml-2 flex items-center justify-center rounded-full border-2 font-condensed font-bold ${dim} ${
              isYou
                ? "border-volt bg-surface-avatar text-volt shadow-volt-glow"
                : `border-surface-raised bg-surface-avatar ${
                    i % 3 === 0 ? "text-volt" : "text-bone"
                  }`
            }`}
          >
            {initials(nickname)}
          </span>
        );
      })}

      {overflow > 0 && (
        <span
          className={`-ml-2 flex items-center justify-center rounded-full border-2 border-surface-raised bg-surface-avatar font-mono text-muted ${dim}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
