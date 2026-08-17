import { Icon } from "@/components/Icon";
import { earnedCount, type Badge } from "@/lib/profile/badges";
import type { Strings } from "@/lib/strings";

/**
 * The badge grid — two columns, five badges, locked ones visible.
 *
 * LOCKED IS DRAWN, NOT HIDDEN, and it is the whole mechanic. A grid that shows
 * only what you have earned tells a new player they have nothing; a grid that
 * shows five greyed cards with "Play 5 games" under them tells them what to do
 * next. Which is why the requirement is a line of text under the name rather
 * than a tooltip: a locked badge whose requirement is invisible is a grey box.
 *
 * THE REQUIREMENT SHOWS ON EARNED BADGES TOO. The alternative — swapping it for
 * a date, or dropping it — makes the two states different shapes, and a grid
 * where half the cards are shorter than the other half reads as a rendering
 * fault. It also cannot be a date: these badges are derived at render time and
 * nothing records WHEN a threshold was crossed (see `lib/profile/badges.ts`).
 *
 * THE DIFFERENCE BETWEEN THE STATES IS COLOUR AND NOTHING ELSE — same size,
 * same position, same text. Earned takes volt on the glyph and bone on the
 * name; locked drops both to `faint` and leaves the tile at `surface`. No
 * opacity on the whole card: fading a tile fades its requirement too, and the
 * requirement is the part a locked badge exists to show.
 *
 * `aria-hidden` on the icons, per the icon set's own rule — every glyph here
 * sits beside the name it illustrates, and announcing "clock" before "Iron
 * legs" reads the badge twice.
 */
export function BadgeGrid({ badges, t }: { badges: Badge[]; t: Strings }) {
  const earned = earnedCount(badges);

  return (
    <section data-testid="badge-grid" className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-body-lg font-semibold text-white">
          {t.profile.badgesTitle}
        </h2>
        <span data-testid="badge-count" className="text-small text-muted">
          {t.profile.badgesCount
            .replace("{earned}", String(earned))
            .replace("{total}", String(badges.length))}
        </span>
      </div>

      {/*
        TWO COLUMNS AT EVERY WIDTH the phone reaches, which is the reference's
        shape. Five is odd, so the last tile sits alone on its row — left
        aligned rather than centred or stretched, because a widened final card
        would be the only card of its size on the page and would read as the
        important one.
      */}
      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-2 p-0">
        {badges.map((badge) => (
          <li
            key={badge.key}
            data-testid="badge"
            data-badge={badge.key}
            data-earned={badge.earned ? "true" : "false"}
            className="flex items-start gap-3 rounded-card bg-surface px-3 py-[14px]"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control border ${
                badge.earned
                  ? "border-hairline-volt text-volt"
                  : "border-hairline text-faint"
              }`}
            >
              <Icon name={badge.icon} className="h-[18px] w-[18px]" />
            </span>

            <span className="min-w-0">
              <span
                className={`block text-body font-semibold leading-tight ${
                  badge.earned ? "text-bone" : "text-faint"
                }`}
              >
                {badge.name}
              </span>
              <span className="mt-[3px] block text-small leading-tight text-muted">
                {badge.requirement}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
