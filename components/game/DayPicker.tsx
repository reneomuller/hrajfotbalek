import Link from "next/link";
import { DayPickerScroll } from "@/components/game/DayPickerScroll";
import type { DayTab } from "@/lib/games/days";

/**
 * The calendar strip above the games list — `ALL · THU 20 · FRI 21 · SAT 22 …`.
 *
 * REAL DATES, NOT GAME COUNTS (v1.2 §5.5). The strip used to read `Sat 2`,
 * where the 2 was two games and not the second of the month — the one number on
 * the control meant the one thing nobody would read it as. Now each chip
 * carries its weekday over its day of the month, which is what a calendar is,
 * and whether a day has football on is carried by a dot instead.
 *
 * EVERY DAY IS DRAWN, INCLUDING THE EMPTY ONES. Closing up the gaps made the
 * strip unable to answer "how far away is this": two adjacent chips meant two
 * consecutive days or two weeks apart with equal likelihood. Rest days are dim
 * and are not links — a chip whose only outcome is an empty list is a tap
 * spent to learn nothing, and that was the right half of the original ruling.
 *
 * A FILTER, NOT A MODE. The default view is every upcoming game, chronological
 * and day-grouped; this narrows it and can always be cleared, both from the
 * "All" chip and by tapping the selected day again. The first version defaulted
 * to the first day with no way back, which meant a game two days out was
 * invisible until you found its tab — and that is how a restricted game's skill
 * badge came to look like a rendering bug rather than a hidden row.
 *
 * LINKS, NOT CLIENT STATE. Each chip is a `?day=` link the server renders the
 * list from: shareable, back-button-correct, and no JavaScript on a page
 * visitors reach from a WhatsApp link on a phone. `DayPickerScroll` only
 * scrolls the selected chip into view, which is enhancement on top.
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
  // Nothing on the board at all — the empty state below says so far better
  // than a fortnight of dim chips would.
  if (tabs.every((tab) => tab.count === 0)) return null;

  return (
    <nav
      data-testid="day-picker"
      aria-label={allLabel}
      className="-mx-gutter mt-3 flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Progressive enhancement only — see the component. Without it the
          strip still filters; the selected chip is just where it lands. */}
      <DayPickerScroll selected={selected} />

      {/* The way back to the whole list, and the resting state. The same
          square as the day chips, so the strip has one baseline. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "page" : undefined}
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-card border font-mono text-[11px] uppercase tracking-[1px] no-underline transition-colors ${
          selected === null
            ? "border-hairline-volt bg-volt text-surface"
            : "border-hairline-strong text-muted"
        }`}
      >
        {allLabel}
      </Link>

      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        const hasGames = tab.count > 0;

        const shell = `flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-[1px] rounded-card border no-underline transition-colors ${
          isSelected
            ? "border-hairline-volt bg-volt text-surface"
            : hasGames
              ? "border-hairline-strong text-white hover:border-hairline-volt"
              : "border-hairline-soft text-dim"
        }`;

        const body = (
          <>
            <span
              className={`font-mono text-[9px] uppercase tracking-[1px] ${
                isSelected ? "text-surface/70" : hasGames ? "text-muted" : "text-dim"
              }`}
            >
              {tab.weekday}
            </span>
            <span className="font-condensed text-[17px] font-bold leading-none">
              {tab.dayOfMonth}
            </span>
            {/*
              The dot is what the count became. A fixed-height slot rather than
              a conditional element, so a day with football and a day without
              are the same size and the row of numerals stays on one baseline.
            */}
            <span
              aria-hidden
              className={`h-[3px] w-[3px] rounded-full ${
                hasGames ? (isSelected ? "bg-surface" : "bg-volt") : "bg-transparent"
              }`}
            />
          </>
        );

        // A rest day is drawn but is not a control, and reads that way to a
        // screen reader too rather than being a link that goes nowhere.
        if (!hasGames) {
          return (
            <span
              key={tab.key}
              data-testid="day-tab"
              data-day={tab.key}
              data-selected="false"
              data-empty="true"
              className={shell}
            >
              {body}
            </span>
          );
        }

        return (
          <Link
            key={tab.key}
            // Tapping the selected day clears it. The gesture people try first
            // is toggling the thing they just tapped.
            href={isSelected ? "/games" : `/games?day=${tab.key}`}
            scroll={false}
            data-testid="day-tab"
            data-day={tab.key}
            data-selected={isSelected ? "true" : "false"}
            data-empty="false"
            className={shell}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
