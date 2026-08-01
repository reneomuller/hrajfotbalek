import Link from "next/link";
import { DayPickerScroll } from "@/components/game/DayPickerScroll";
import type { DayTab } from "@/lib/games/days";

/**
 * The day strip above the games list — `Today 1 · Sat 2 · Sun 3` (§5.5).
 *
 * LINKS, NOT CLIENT STATE. Each tab is a `?day=` link the server renders the
 * list from. That makes the selection shareable and back-button-correct, costs
 * no JavaScript on a page a visitor often reaches from a WhatsApp link on a
 * phone, and keeps the filtering where the data already is. A client-side
 * filter would also mean shipping every day's games to render one of them.
 *
 * THE COUNT IS PART OF THE CONTROL, not decoration: a tab that turns out to
 * hold nothing is a tap wasted, and on a phone that is the whole interaction.
 * Days with no games get no tab at all, so the count is never zero.
 *
 * One day means no strip. A single tab that cannot be switched away from is
 * chrome pretending to be navigation.
 */
export function DayPicker({
  tabs,
  selected,
}: {
  tabs: DayTab[];
  selected: string | null;
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
      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        return (
          <Link
            key={tab.key}
            href={`/games?day=${tab.key}`}
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
