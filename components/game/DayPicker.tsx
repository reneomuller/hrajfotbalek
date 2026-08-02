import Link from "next/link";
import { DayPickerScroll } from "@/components/game/DayPickerScroll";
import type { DayTab } from "@/lib/games/days";

/**
 * The day strip above the games list — `All · Today 1 · Sat 2 · Sun 3`.
 *
 * A FILTER, NOT A MODE. The default view is every upcoming game, chronological
 * and day-grouped; this narrows it and can always be cleared. The first
 * version defaulted to the first day and had no way back to the whole list,
 * which meant a game two days out was invisible until you found its tab — and
 * that is how a restricted game's skill badge came to look like a rendering
 * bug rather than a hidden row.
 *
 * TAPPING THE SELECTED DAY CLEARS IT, as well as the explicit "All" chip.
 * Toggling the thing you just tapped is the gesture people try first, and a
 * filter that only clears from a separate control is a filter people get stuck
 * in.
 *
 * LINKS, NOT CLIENT STATE. Each tab is a `?day=` link the server renders the
 * list from: shareable, back-button-correct, and no JavaScript on a page
 * visitors reach from a WhatsApp link on a phone.
 *
 * THE COUNT IS PART OF THE CONTROL. Days with no games get no tab, so it is
 * never zero.
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
  if (tabs.length < 2) return null;

  return (
    <nav
      data-testid="day-picker"
      className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Progressive enhancement only — see the component. Without it the
          strip still filters; the selected tab is just where it lands. */}
      <DayPickerScroll selected={selected} />

      {/* The way back to the whole list, and the resting state. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "page" : undefined}
        className={`shrink-0 rounded-chip border px-3 py-2 font-mono text-[11px] uppercase tracking-[1px] no-underline ${
          selected === null
            ? "border-hairline-volt bg-volt text-surface"
            : "border-hairline-strong text-muted"
        }`}
      >
        {allLabel}
      </Link>

      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        return (
          <Link
            key={tab.key}
            // Tapping the selected day clears it. The gesture people try
            // first is toggling the thing they just tapped.
            href={isSelected ? "/games" : `/games?day=${tab.key}`}
            scroll={false}
            data-testid="day-tab"
            data-day={tab.key}
            data-selected={isSelected ? "true" : "false"}
            aria-current={isSelected ? "page" : undefined}
            className={`shrink-0 rounded-chip border px-3 py-2 font-mono text-[11px] uppercase tracking-[1px] no-underline ${
              isSelected
                ? "border-hairline-volt bg-volt text-surface"
                : "border-hairline-strong text-muted"
            }`}
          >
            {tab.label}{" "}
            <span className={isSelected ? "text-surface/70" : "text-faint"}>
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
