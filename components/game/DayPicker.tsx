import Link from "next/link";
import { DayPickerScroll } from "@/components/game/DayPickerScroll";
import type { DayTab } from "@/lib/games/days";

/**
 * The day filter above the games list — `All · Today 3 · Tomorrow 1 · Sat 2`.
 *
 * RESTORED FROM `ed9997c` (Design Stage 1) by the owner's ruling of
 * 2026-08-10, which reverses the eight-box calendar strip. The markup and the
 * behaviour are that component's; only the skin is v1.3.
 *
 * WHY THE REVERSAL. The eight-box strip drew a fixed window of days whether or
 * not they had games — and a fixed window cannot cover an unbounded schedule.
 * A game published for late August fell outside it and became unreachable from
 * `/games`, which is the invisible truncation ruling H forbade in its own text.
 * This control filters what EXISTS instead: every day with football on it gets
 * a tab, however far out.
 *
 * `All` IS THE DEFAULT AND IT IS UNBOUNDED. That is the guarantee — any game
 * published any distance into the future is on the first load of this page,
 * with no strip to scroll and no window to fall outside of.
 *
 * A FILTER, NOT A MODE. Tapping a day narrows; tapping `All`, or tapping the
 * selected day again, returns to everything. Toggling the thing you just
 * tapped is the gesture people try first, and a filter that only clears from a
 * separate control is a filter people get stuck in.
 *
 * LINKS, NOT CLIENT STATE. Each tab is a `?day=` link the server renders the
 * list from: shareable, back-button-correct, and no JavaScript on a page most
 * visitors reach from a WhatsApp link on a phone. `DayPickerScroll` only
 * scrolls the selected tab into view, which is enhancement on top.
 *
 * THE COUNT IS PART OF THE CONTROL. Days with no games get no tab, so it is
 * never zero and a tab is never a tap that leads nowhere.
 *
 * WHAT THE v1.3 SKIN CHANGED, and nothing else did: `rounded-chip` is gone
 * with the six-radius table (ruling A) and these are `pill`; the mono face is
 * reserved for the variabilní symbol (§1.4) so the label is `sans`; and the
 * tracked capitals are sentence case (ruling B), which leaves `eyebrow` as the
 * product's only uppercase style.
 */
export function DayPicker({
  tabs,
  selected,
  allLabel,
}: {
  tabs: DayTab[];
  selected: string | null;
  allLabel: string;
}) {
  // One day of football is not a filter — the list already shows it.
  if (tabs.length < 2) return null;

  const chip = (isSelected: boolean) =>
    `flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-4 text-body no-underline transition-colors ${
      isSelected
        ? "bg-volt font-semibold text-ink"
        : "bg-surface-raised text-muted hover:text-bone"
    }`;

  return (
    <nav
      data-testid="day-picker"
      aria-label={allLabel}
      className="-mx-gutter mt-4 flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Progressive enhancement only — see the component. Without it the
          filter still works; the selected tab is just where it lands. */}
      <DayPickerScroll selected={selected} />

      {/* The way back to everything, and the resting state. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "page" : undefined}
        className={chip(selected === null)}
      >
        {allLabel}
      </Link>

      {tabs.map((tab) => {
        const isSelected = tab.key === selected;

        return (
          <Link
            key={tab.key}
            // Tapping the selected day clears it.
            href={isSelected ? "/games" : `/games?day=${tab.key}`}
            scroll={false}
            data-testid="day-tab"
            data-day={tab.key}
            data-selected={isSelected ? "true" : "false"}
            aria-current={isSelected ? "page" : undefined}
            className={chip(isSelected)}
          >
            {tab.label}
            <span
              data-testid="day-tab-count"
              className={isSelected ? "text-ink/70" : "text-faint"}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
