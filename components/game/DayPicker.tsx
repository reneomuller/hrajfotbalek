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
  /*
   * THE CELL, from `d488826`'s markup with the skin adapted and nothing else.
   *
   * `h-12 w-12`, a boxed square, weekday over date — recognisable as the old
   * calendar at a glance, which is the requirement. What the v1.3 tokens
   * changed: `rounded-card` is the surviving card radius (ruling A), the mono
   * and condensed faces are gone from player-facing UI (§1.4) so both lines
   * are `sans`, and the retired greys resolve to `muted` / `faint`.
   *
   * The BORDER is kept rather than collapsed to a fill. Ruling C takes strokes
   * off cards and chips; these are calendar cells, and the box is the thing
   * being recognised.
   */
  /*
    `min-w-12` RATHER THAN `w-12`, and horizontal padding with it.

    The cells were a fixed 48px square, which was right when every top line
    was a three-letter weekday. Section 3 item 1 puts "Today" and "Tomorrow"
    in the first two, and `TOMORROW` is eight characters — it overflowed its
    box and collided with the cell beside it. The square is now a FLOOR: the
    weekday cells keep it exactly, and the two word cells grow to fit their
    label rather than clipping it.

    Which is also why the label is not truncated instead: §2.8's chip rule —
    "they never truncate a label" — is the same argument one control over, and
    `Tomo…` in a calendar is worse than a wider cell.
  */
  const cell =
    "flex h-12 min-w-12 shrink-0 flex-col items-center justify-center gap-[1px] rounded-card border px-2 no-underline transition-colors";
  const skin = (isSelected: boolean, hasGames: boolean) =>
    isSelected
      ? "border-hairline-volt bg-volt text-ink"
      : hasGames
        ? "border-hairline-strong text-bone hover:border-hairline-volt"
        : "border-hairline text-faint hover:border-hairline-strong";

  return (
    <nav
      data-testid="day-picker"
      aria-label={allLabel}
      className="-mx-gutter mt-4 flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Progressive enhancement only — see the component. Without it the
          filter still works; the selected cell is just where it lands. */}
      <DayPickerScroll selected={selected} />

      {/* The way back to everything, and the resting state. The same square as
          the day cells, so the row has one baseline. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "page" : undefined}
        className={`${cell} text-small font-semibold ${
          selected === null
            ? "border-hairline-volt bg-volt text-ink"
            : "border-hairline-strong text-muted hover:border-hairline-volt"
        }`}
      >
        {allLabel}
      </Link>

      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        const hasGames = tab.count > 0;

        return (
          <Link
            key={tab.key}
            // Tapping the selected day clears it.
            href={isSelected ? "/games" : `/games?day=${tab.key}`}
            scroll={false}
            data-testid="day-tab"
            data-day={tab.key}
            data-selected={isSelected ? "true" : "false"}
            data-empty={hasGames ? "false" : "true"}
            aria-current={isSelected ? "page" : undefined}
            className={`${cell} ${skin(isSelected, hasGames)}`}
          >
            {/*
              UPPER, and ruling B does not reach in here (owner's amendment):
              a calendar cell is data display rather than a heading, and the
              abbreviation style is the original's.
            */}
            <span
              className={`whitespace-nowrap text-[9px] uppercase tracking-[1px] ${
                isSelected ? "text-ink/70" : hasGames ? "text-muted" : "text-faint"
              }`}
            >
              {tab.weekday}
            </span>
            <span className="text-[17px] font-bold leading-none">{tab.dayOfMonth}</span>
            {/*
              The dot marks a day with football on it — a fixed-height slot
              rather than a conditional element, so every cell is the same size
              and the row of numerals stays on one baseline.

              EVERY DAY IS A LINK NOW, including an empty one (amendment A):
              tapping it shows the list's empty state, which is a real answer
              rather than a dead control.
            */}
            <span
              aria-hidden
              data-testid="day-tab-dot"
              className={`h-[3px] w-[3px] rounded-full ${
                hasGames ? (isSelected ? "bg-ink" : "bg-volt") : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
