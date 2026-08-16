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

  /*
   * AMENDMENT A: a FIXED WEEK, today through today + 6, whether or not a day
   * has games. The data-driven version was faithful to `ed9997c` and wrong in
   * practice — on a quiet board it collapsed to three tabs and read as broken.
   */
  it("is always eight cells — today through today + 7 inclusive", () => {
    // Inclusive of the same-weekday bookend, so someone thinking "next
    // Monday" finds it in the row rather than having to leave it.
    const tabs = buildDayTabs([], now);
    expect(tabs).toHaveLength(8);
    expect(tabs[0].key).toBe("2026-08-03");
    expect(tabs.at(-1)!.key).toBe("2026-08-10");
  });

  it("keeps its width on a board with almost nothing on it", () => {
    // One game, still eight cells. This is the whole point of the amendment.
    expect(buildDayTabs(["2026-08-05T17:00:00Z"], now)).toHaveLength(8);
  });

  it("counts games per day, and zero is normal", () => {
    const tabs = buildDayTabs(
      ["2026-08-03T17:00:00Z", "2026-08-03T19:00:00Z", "2026-08-05T17:00:00Z"],
      now,
    );
    expect(tabs.map((tab) => tab.count)).toEqual([2, 0, 1, 0, 0, 0, 0, 0]);
  });

  it("carries a weekday and a day of month for the calendar cell", () => {
    // English STATED, not defaulted: `DEFAULT_LOCALE` is Czech now, so a bare
    // call renders `PO`. Naming the locale is what makes this a test of the
    // shape rather than of whichever default happens to be in force.
    const tabs = buildDayTabs([], now, "en");
    // The 3rd of August 2026 is a Monday.
    expect(tabs[0]).toMatchObject({ weekday: "MON", dayOfMonth: "3" });
    expect(tabs[1]).toMatchObject({ weekday: "TUE", dayOfMonth: "4" });
  });

  it("localises the weekday, which the original did not", () => {
    // `ed9997c` hardcoded `en-GB`, so a Czech page read `SAT`. The look is the
    // ruling; the language bug is not.
    expect(buildDayTabs([], now, "cs")[0].weekday).toBe("PO");
    expect(buildDayTabs([], now, "ru")[0].weekday).toBe("ПН");
  });

  it("crosses a month boundary without repeating or skipping a date", () => {
    const keys = buildDayTabs([], "2026-08-28T09:00:00Z").map((tab) => tab.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("2026-08-31");
    expect(keys).toContain("2026-09-01");
  });

  it("crosses the autumn DST change without repeating or skipping a date", () => {
    // Prague falls back on 2026-10-25, a 25-hour day. A row built by adding
    // 86,400,000ms to a local midnight lands twice on the 25th.
    const keys = buildDayTabs([], "2026-10-22T09:00:00Z").map((tab) => tab.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("2026-10-24");
    expect(keys).toContain("2026-10-25");
    expect(keys).toContain("2026-10-26");
  });

  it("puts a late-evening game on the day the players would name it", () => {
    // 22:30Z Monday is 00:30 Tuesday in Prague.
    const tabs = buildDayTabs(["2026-08-03T22:30:00Z"], now);
    expect(tabs.find((tab) => tab.count > 0)!.key).toBe("2026-08-04");
  });

  /*
   * THE WEEK IS A CONVENIENCE, NOT THE ONLY ROUTE. A game beyond it has no
   * cell and is still reachable — `All` is unbounded, which is what stops this
   * being the eight-box strip returning under another name.
   */
  it("does not pretend to reach a game beyond the week", () => {
    const tabs = buildDayTabs(["2026-09-20T17:00:00Z"], now);
    expect(tabs).toHaveLength(8);
    expect(tabs.every((tab) => tab.count === 0)).toBe(true);
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
    // English is stated for the same reason as above — the default is Czech.
    const groups = groupByDay(
      [{ at: "2026-08-03T17:00:00Z" }, { at: "2026-08-04T17:00:00Z" }],
      (item) => item.at,
      now,
      strings,
      "en",
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
    { key: "2026-08-03", weekday: "MON", dayOfMonth: "3", count: 1 },
    // A zero-count tab is not something `buildDayTabs` produces any more, and
    // is kept here on purpose: `resolveSelectedDay` is the guard against a
    // hand-edited `?day=`, so it must still refuse one.
    { key: "2026-08-04", weekday: "TUE", dayOfMonth: "4", count: 0 },
    { key: "2026-08-05", weekday: "WED", dayOfMonth: "5", count: 2 },
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
