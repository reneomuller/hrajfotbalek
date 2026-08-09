import Link from "next/link";
import { DayPickerScroll } from "@/components/game/DayPickerScroll";
import type { DayTab } from "@/lib/games/days";

/**
 * The day strip above the games list (v1.3 §2.2, ruling H).
 *
 * EXACTLY EIGHT BOXES, TODAY FIRST — scrollable below `md`, fully visible
 * above it. The width being fixed is the change: the previous strip was a
 * fortnight extended to reach the furthest game, so it was eight boxes one
 * week and twenty-three the next, and a control whose size is a function of
 * the schedule cannot be laid out to fit anything.
 *
 * A FILTER, NOT A MODE, and the list is never truncated by it. That is the
 * other half of ruling H and it is what makes the eight-box cap safe: a game
 * three weeks out has no chip, and it is still on the default list under its
 * own day heading. A chip is a filter, not a route.
 *
 * THE COUNT IS PRINTED AGAIN. v1.2 replaced it with a dot because `Sat 2` read
 * as Saturday the 2nd — but that was a ONE-LINE layout problem, and §2.2 gives
 * the box three lines: weekday, date, count. A small grey number underneath a
 * large date cannot be mistaken for the date above it, and it answers the
 * question the dot could only gesture at ("is it worth tapping" vs "how much
 * is there"). Omitted entirely at zero, per §2.2.
 *
 * EVERY DAY IS DRAWN, INCLUDING THE EMPTY ONES. Closing up the gaps made the
 * strip unable to answer "how far away is this": two adjacent chips meant two
 * consecutive days or two weeks apart with equal likelihood. Rest days are dim
 * and are NOT LINKS and NOT FOCUSABLE — a chip whose only outcome is an empty
 * list is a tap spent to learn nothing, and a keyboard should not stop on it
 * either (§2.2, v1.2 A).
 *
 * SELECTION IS ANNOUNCED, NOT INFERRED FROM THE FILL. `aria-current` is on
 * every selected box, including the day boxes, which previously carried the
 * state only as a `data-` attribute and a colour — so a screen-reader user was
 * told which days existed and never which one they were looking at.
 *
 * LINKS, NOT CLIENT STATE. Each box is a `?day=` link the server renders the
 * list from: shareable, back-button-correct, and no JavaScript needed on a
 * page most visitors reach from a WhatsApp link on a phone. `DayPickerScroll`
 * only scrolls the selected box into view, which is enhancement on top.
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
  // than eight dim boxes would.
  if (tabs.every((tab) => tab.count === 0)) return null;

  /*
   * `h-16` is 64px for three lines of content, comfortably over §2.0's 44px
   * target floor; `w-14` is 56px, which is what eight boxes plus the All
   * affordance need to fit inside `md` without scrolling (9 × 56 + 8 × 8 =
   * 568px, against a 768px breakpoint).
   *
   * Ruling C: no stroke on a day box. The three states are three FILLS —
   * selected is volt, a day with games is raised, a rest day is flat against
   * the page and reads as unavailable without needing a word.
   */
  const box =
    "flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-[2px] rounded-control no-underline transition-colors";

  return (
    <nav
      data-testid="day-picker"
      aria-label={allLabel}
      className="-mx-gutter mt-4 flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] md:overflow-x-visible [&::-webkit-scrollbar]:hidden"
    >
      {/* Progressive enhancement only — see the component. Without it the
          strip still filters; the selected box is just where it lands. */}
      <DayPickerScroll selected={selected} />

      {/* The way back to the whole list, and the resting state. The same box
          as the days, so the strip has one baseline. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "true" : undefined}
        className={`${box} text-body-lg font-semibold ${
          selected === null ? "bg-volt text-ink" : "bg-surface-raised text-muted"
        }`}
      >
        {allLabel}
      </Link>

      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        const hasGames = tab.count > 0;

        const shell = `${box} ${
          isSelected
            ? "bg-volt text-ink"
            : hasGames
              ? "bg-surface-raised text-bone hover:bg-surface"
              : "bg-surface text-faint"
        }`;

        const body = (
          <>
            <span
              className={`text-small ${
                isSelected ? "text-ink/70" : hasGames ? "text-muted" : "text-faint"
              }`}
            >
              {tab.weekday}
            </span>
            <span className="text-body-lg font-semibold leading-none">
              {tab.dayOfMonth}
            </span>
            {/*
              OMITTED AT ZERO (§2.2), and the slot goes with it rather than
              being held open — a rest day has nothing to say on its third
              line, and `justify-center` keeps the two remaining lines
              optically centred in a box whose height is fixed. So the row of
              dates stays on one baseline either way.
            */}
            {hasGames && (
              <span
                data-testid="day-tab-count"
                className={`text-small leading-none ${
                  isSelected ? "text-ink/70" : "text-faint"
                }`}
              >
                {tab.count}
              </span>
            )}
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
            aria-current={isSelected ? "true" : undefined}
            className={shell}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
