import { describe, expect, it } from "vitest";
import {
  buildDayTabs,
  groupByDay,
  pragueDayKey,
  resolveSelectedDay,
} from "@/lib/games/days";
import { strings } from "@/lib/strings";

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

  it("counts the games on each day and orders the tabs by date", () => {
    const tabs = buildDayTabs(
      [
        "2026-08-05T17:00:00Z",
        "2026-08-03T17:00:00Z",
        "2026-08-04T17:00:00Z",
        "2026-08-04T19:00:00Z",
      ],
      now,
      strings,
    );

    expect(tabs.map((t) => [t.key, t.count])).toEqual([
      ["2026-08-03", 1],
      ["2026-08-04", 2],
      ["2026-08-05", 1],
    ]);
  });

  it("labels today and tomorrow relatively, and the rest by weekday", () => {
    const tabs = buildDayTabs(
      ["2026-08-03T17:00:00Z", "2026-08-04T17:00:00Z", "2026-08-05T17:00:00Z"],
      now,
      strings,
    );

    expect(tabs.map((t) => t.label)).toEqual([
      strings.games.dayToday,
      strings.games.dayTomorrow,
      "Wed",
    ]);
  });

  it("gives no tab to a day with no games — the count is never zero", () => {
    // Monday and Wednesday, with nothing on Tuesday.
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z", "2026-08-05T17:00:00Z"], now, strings);
    expect(tabs).toHaveLength(2);
    expect(tabs.every((tab) => tab.count > 0)).toBe(true);
    expect(tabs.map((t) => t.key)).not.toContain("2026-08-04");
  });

  it("returns nothing at all when there are no games", () => {
    expect(buildDayTabs([], now, strings)).toEqual([]);
  });

  it("puts a late-evening game on the day the players would name it", () => {
    // 22:30Z on Monday is 00:30 Tuesday in Prague, and belongs to Tuesday.
    const tabs = buildDayTabs(["2026-08-03T22:30:00Z"], now, strings);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].key).toBe("2026-08-04");
    expect(tabs[0].label).toBe(strings.games.dayTomorrow);
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
    { key: "2026-08-05", label: "Wed", count: 2 },
  ];

  it("honours a requested day that has games", () => {
    expect(resolveSelectedDay("2026-08-05", tabs)).toBe("2026-08-05");
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
