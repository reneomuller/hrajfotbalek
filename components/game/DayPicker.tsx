import Link from "next/link";
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
 * visitors reach from a WhatsApp link on a phone.
 *
 * NOTHING SCROLLS, AND NOTHING MAY (owner's calendar-width ruling): "scrolling
 * calendars hide days — visibility wins". The row is `All` plus the eight cells
 * `buildDayTabs` returns, and all nine sit inside the page gutter at 390px with
 * one shared gap. Which is why the cells are `flex-1` rather than a measured
 * width: a fixed cell either leaves a ragged tail at one width or overflows at
 * another, and an overflow here is a day nobody can see.
 *
 * WHAT WENT WITH THE SCROLL. `-mx-gutter`/`px-gutter` — the full-bleed trick
 * that let the strip run under the page edge — and `DayPickerScroll`, a client
 * component whose only job was to scroll the selected tab back into view after
 * a tap navigated. Both existed to make a scrolling strip usable; there is no
 * scrolling strip. The row's margins are now the ordinary page gutter, which is
 * what puts its edges on the same line as the cards beneath it.
 *
 * A DAY WITH NO GAMES STILL GETS ITS CELL, greyed and dotless (amendment A).
 * The window is a calendar rather than a list of what exists, and a calendar
 * that omits its empty days is one a reader cannot count along.
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
    `flex-1 min-w-0` RATHER THAN ANY MEASURED WIDTH.

    The cells have been a fixed 48px, then a fixed 34px measured to fit nine of
    them at 390px. Both are the same mistake at different sizes: a width chosen
    for one viewport is wrong at every other one, and wrong here means either a
    ragged gap after the last cell or a ninth cell over the edge.

    Flexing divides whatever the gutter leaves. At 390px that is
    (390 - 2x22 - 8x4) / 9 = 34.9px per cell, a shade wider than the measured
    value it replaces, and it grows from there — so the two word cells get
    MORE room than the width they were already proven to fit, not less.

    `min-w-0` is load-bearing: a flex item's default `min-width: auto` refuses
    to shrink below its content, so without it "Today" would push the row wider
    than its container and restore the overflow at exactly the widths where the
    labels are longest — which is to say, in Czech and Russian.
  */
  /*
    `rounded-control`, NOT `rounded-card`, AND THE STRIP IS WHAT CAUGHT IT.

    A cell is 34.9px wide. `card` is 18px, which is more than half of that, so
    CSS clamps both corner radii proportionally and the "boxed square" this
    component's comment describes renders as a full OVAL — nine touching
    ellipses rather than a calendar. It has looked like this since the cells
    went from 48px to 34px; the width was measured, the radius was not, and
    nothing in the anatomy was written down as depending on the two together.

    `control` is 14px, still inside ruling A's radius table, and leaves ~7px of
    straight edge on each side of every corner. The box comes back.

    THE GENERAL RULE, since this will happen again: a radius token is only a
    rounded rectangle while it is under half the SHORT side. Below that it is
    a pill, whatever it is named.
  */
  const cell =
    "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-[1px] rounded-control border no-underline transition-colors";
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
      className="mt-4 flex gap-1"
    >
      {/* The way back to everything, and the resting state. It flexes with the
          day cells rather than sizing to its label, so the nine are one row of
          equal boxes rather than eight and a wider one. */}
      <Link
        href="/games"
        scroll={false}
        data-testid="day-tab-all"
        data-selected={selected === null ? "true" : "false"}
        aria-current={selected === null ? "page" : undefined}
        className={`${cell} text-[11px] font-semibold ${
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
              className={`whitespace-nowrap text-[8px] uppercase ${
                isSelected ? "text-ink/70" : hasGames ? "text-muted" : "text-faint"
              }`}
            >
              {tab.weekday}
            </span>
            <span className="text-[15px] font-bold leading-none">{tab.dayOfMonth}</span>
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
