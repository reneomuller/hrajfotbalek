import { describe, expect, it } from "vitest";
import {
  buildDayTabs,
  groupByDay,
  pragueDayKey,
  resolveSelectedDay,
} from "@/lib/games/days";
import { strings } from "@/lib/strings";
import { resolveStrings } from "@/lib/i18n/resolve";

/**
 * Phase 2 §5.5 / REQ-GAME-021.
 *
 * Written against fixed UTC instants, so these hold regardless of the host
 * timezone — the same discipline as `lib/__tests__/format.test.ts`, and for
 * the same reason: a day boundary computed in the host zone looks right in
 * local dev and renders wrong on Vercel.
 */

describe("pragueDayKey", () => {
  it("returns an ISO-ordered key, so days sort lexicographically", () => {
    expect(pragueDayKey("2026-08-03T17:30:00Z")).toBe("2026-08-03");
  });

  it("uses the PRAGUE calendar day, not the UTC one", () => {
    // 22:30 UTC on the 3rd is 00:30 on the 4th in Prague (CEST, UTC+2). The
    // pitch's day is the product's day — a midnight kickabout belongs to the
    // date the players would name.
    expect(pragueDayKey("2026-08-03T22:30:00Z")).toBe("2026-08-04");
    // And the reverse near the start of the day.
    expect(pragueDayKey("2026-08-03T00:30:00Z")).toBe("2026-08-03");
  });

  it("handles the winter offset too, where Prague is UTC+1", () => {
    expect(pragueDayKey("2026-01-15T23:30:00Z")).toBe("2026-01-16");
  });

  it("refuses an unparseable instant rather than inventing a day", () => {
    expect(() => pragueDayKey("not a date")).toThrow(TypeError);
  });
});

describe("buildDayTabs", () => {
  const now = "2026-08-03T09:00:00Z"; // Monday, 11:00 in Prague

  it("emits one tab per day that HAS games, in date order", () => {
    const tabs = buildDayTabs(
      ["2026-08-05T17:00:00Z", "2026-08-03T17:00:00Z", "2026-08-03T19:00:00Z"],
      now,
      strings,
    );

    expect(tabs.map((tab) => [tab.key, tab.count])).toEqual([
      ["2026-08-03", 2],
      ["2026-08-05", 1],
    ]);
  });

  it("gives an empty day NO tab, so a count is never zero", () => {
    // A tab that leads to an empty list is a tap spent to learn nothing.
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z"], now, strings);
    expect(tabs.map((tab) => tab.key)).toEqual(["2026-08-03"]);
    expect(tabs.every((tab) => tab.count > 0)).toBe(true);
  });

  /*
   * THE RULING THAT BROUGHT THIS BACK. The eight-box calendar drew a fixed
   * window whether or not those days had games — and a fixed window cannot
   * cover an unbounded schedule, so a game published for late August fell
   * outside it and became unreachable from `/games`. That is the invisible
   * truncation ruling H forbade in its own text.
   */
  it("reaches a game ANY distance out — the truncation guarantee", () => {
    const lateAugust = "2026-08-28T17:00:00Z";
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z", lateAugust], now, strings);

    expect(tabs.map((tab) => tab.key)).toContain("2026-08-28");
    // And nothing between them is invented to pad a window.
    expect(tabs).toHaveLength(2);
  });

  it("reaches a game months out", () => {
    const tabs = buildDayTabs(["2026-11-14T17:00:00Z"], now, strings);
    expect(tabs.map((tab) => tab.key)).toEqual(["2026-11-14"]);
  });

  it("labels today and tomorrow relatively, and the rest by weekday", () => {
    const tabs = buildDayTabs(
      ["2026-08-03T17:00:00Z", "2026-08-04T17:00:00Z", "2026-08-08T17:00:00Z"],
      now,
      strings,
    );

    expect(tabs[0].label).toBe(strings.games.dayToday);
    expect(tabs[1].label).toBe(strings.games.dayTomorrow);
    // The 8th of August 2026 is a Saturday.
    expect(tabs[2].label).toBe("Sat");
  });

  it("localises the weekday, which is the one thing NOT ported verbatim", () => {
    /*
     * `ed9997c` hardcoded `en-GB`, so a Czech games page read
     * `Vše · Dnes · Sat`. Restoring the shape exactly would have restored a
     * defect fixed since — the arrangement is the ruling, the language bug is
     * not.
     */
    const cs = resolveStrings("cs");
    const tabs = buildDayTabs(["2026-08-08T17:00:00Z"], now, cs, "cs");
    expect(tabs[0].label).toBe("So");
    expect(tabs[0].label).not.toBe("Sat");
  });

  it("returns nothing for an empty board", () => {
    expect(buildDayTabs([], now, strings)).toEqual([]);
  });

  it("puts a late-evening game on the day the players would name it", () => {
    // 22:30Z Monday is 00:30 Tuesday in Prague, and belongs to Tuesday.
    const tabs = buildDayTabs(["2026-08-03T22:30:00Z"], now, strings);
    expect(tabs[0].key).toBe("2026-08-04");
  });
});

describe("groupByDay", () => {
  const now = "2026-08-03T09:00:00Z"; // Monday

  it("groups by Prague day, in kick-off order, with a heading per day", () => {
    const groups = groupByDay(
      [
        { at: "2026-08-05T17:00:00Z" },
        { at: "2026-08-03T17:00:00Z" },
        { at: "2026-08-03T19:00:00Z" },
      ],
      (item) => item.at,
      now,
      strings,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-08-03", "2026-08-05"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it("carries the date in the heading as well as the relative word", () => {
    // "Today" alone stops meaning anything once you have scrolled past it.
    const groups = groupByDay(
      [{ at: "2026-08-03T17:00:00Z" }, { at: "2026-08-04T17:00:00Z" }],
      (item) => item.at,
      now,
      strings,
    );

    expect(groups[0].label).toContain(strings.games.dayToday);
    expect(groups[0].label).toContain("3 Aug");
    expect(groups[1].label).toContain(strings.games.dayTomorrow);
    expect(groups[1].label).toContain("4 Aug");
  });

  it("puts a late-evening game under the day the players would name", () => {
    const groups = groupByDay(
      [{ at: "2026-08-03T22:30:00Z" }],
      (item) => item.at,
      now,
      strings,
    );
    expect(groups[0].key).toBe("2026-08-04");
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], () => "", now, strings)).toEqual([]);
  });
});

describe("resolveSelectedDay", () => {
  const tabs = [
    { key: "2026-08-03", label: "Today", count: 1 },
    // A zero-count tab is not something `buildDayTabs` produces any more, and
    // is kept here on purpose: `resolveSelectedDay` is the guard against a
    // hand-edited `?day=`, so it must still refuse one.
    { key: "2026-08-04", label: "Tue", count: 0 },
    { key: "2026-08-05", label: "Wed", count: 2 },
  ];

  it("honours a requested day that has games", () => {
    expect(resolveSelectedDay("2026-08-05", tabs)).toBe("2026-08-05");
  });

  it("refuses a day that is drawn but empty", () => {
    // The strip covers a rolling fortnight so it can be a calendar; the filter
    // still only accepts days there is something to filter to. Without this, a
    // link shared on the day of a game and opened after it lands on an empty
    // list instead of the whole board.
    expect(resolveSelectedDay("2026-08-04", tabs)).toBeNull();
  });

  it("selects NOTHING by default — the whole list is the resting state", () => {
    // The strip is a filter, not a mode. Defaulting to the first day made "one
    // day" the only state the list had: you could narrow it and never widen it
    // again, and a game two days out was invisible until you found its tab.
    expect(resolveSelectedDay(undefined, tabs)).toBeNull();
  });

  it("falls back to the whole list for a stale or junk day", () => {
    // A day shared on Friday and opened on Monday should show everything —
    // the thing the reader can act on — not a different day they did not ask
    // for.
    expect(resolveSelectedDay("2026-07-30", tabs)).toBeNull();
    expect(resolveSelectedDay("'; drop table games;--", tabs)).toBeNull();
    expect(resolveSelectedDay("", tabs)).toBeNull();
  });

  it("selects nothing when there is nothing to select", () => {
    expect(resolveSelectedDay("2026-08-03", [])).toBeNull();
  });
});
