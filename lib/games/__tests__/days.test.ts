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

  it("runs a CONTINUOUS window from today — rest days included", () => {
    // Monday and Wednesday, with nothing on Tuesday. Tuesday still gets a chip.
    // Closing up the gaps was what made the strip unable to answer "how far
    // away is this": two adjacent chips meant consecutive days or three weeks
    // apart with equal likelihood.
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z", "2026-08-05T17:00:00Z"], now);

    expect(tabs.slice(0, 3).map((t) => [t.key, t.count])).toEqual([
      ["2026-08-03", 1],
      ["2026-08-04", 0],
      ["2026-08-05", 1],
    ]);
  });

  it("carries a real date on every chip — weekday over day of month", () => {
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z"], now);

    // The 3rd of August 2026 is a Monday. The chip reads Mon over 3, which is
    // a date; the old strip read "Today 1", where the 1 was a game count that
    // every reader took for a date.
    //
    // SENTENCE CASE, not `MON` (v1.3 ruling B): `eyebrow` is the only
    // uppercase style in the product, and a day label is not one. The case is
    // fixed at the token rather than in CSS so the rendered width is known
    // here, which is what the 8-box strip is laid out against.
    expect(tabs[0]).toMatchObject({
      key: "2026-08-03",
      weekday: "Mon",
      dayOfMonth: "3",
      isToday: true,
    });
    expect(tabs[1]).toMatchObject({ weekday: "Tue", dayOfMonth: "4", isToday: false });
  });

  it("names the weekday in the READER'S language, capitalised", () => {
    /*
     * The strip used to hardcode `en-GB`, so the Czech games list read
     * `Mon 10 · Tue 11` under a Czech heading — the most prominent control on
     * the screen, in the wrong language, on a surface whose whole job is
     * choosing a day. Ruling H making the strip eight fixed boxes is what put
     * it under the nose; the defect predates it.
     *
     * CAPITALISED because `Intl` yields `st` for Czech and `ср` for Russian,
     * and ruling B wants sentence case rather than lower — a box reading `st`
     * looks like a truncation.
     */
    expect(buildDayTabs([], now, "cs")[0].weekday).toBe("Po");
    expect(buildDayTabs([], now, "ru")[0].weekday).toBe("Пн");
    expect(buildDayTabs([], now, "en")[0].weekday).toBe("Mon");
  });

  it("prints a bare day-of-month numeral in every language", () => {
    // Czech `day: "numeric"` yields `3.` — correct as an ordinal inside a
    // sentence, wrong inside a calendar box, where every other calendar the
    // reader has ever used prints a bare numeral. Taken from the day key
    // rather than from `Intl`, so it cannot drift by locale at all.
    for (const locale of ["en", "cs", "ru"] as const) {
      expect(buildDayTabs([], now, locale)[0].dayOfMonth).toBe("3");
    }
  });

  it("starts at today, never before it", () => {
    // A game that already kicked off today still belongs to today's chip, but
    // nothing earlier is drawn: the list is upcoming games.
    const tabs = buildDayTabs(["2026-08-03T17:00:00Z"], now);
    expect(tabs[0].key).toBe("2026-08-03");
    expect(tabs.every((t) => t.key >= "2026-08-03")).toBe(true);
  });

  it("is EXACTLY EIGHT BOXES, today first (ruling H)", () => {
    // v1.3 §2.2 fixes the width of this control. The previous window was a
    // floor of fourteen days that EXTENDED to reach the furthest game, which
    // made the strip a different width on every load — a control whose size is
    // a function of the schedule cannot be laid out, and above `md` it has to
    // be fully visible without scrolling.
    const tabs = buildDayTabs([], now);
    expect(tabs).toHaveLength(8);
    expect(tabs[0].key).toBe("2026-08-03");
    expect(tabs.at(-1)!.key).toBe("2026-08-10");
  });

  it("stays eight boxes when a game falls outside the window", () => {
    // The strip no longer stretches to the furthest game, and it does not need
    // to: ruling H says the strip FILTERS and the list is never truncated by
    // it, so a game three weeks out is still on the default list. What it loses
    // is a chip of its own, which is a filter it never had a reason to be.
    const tabs = buildDayTabs(["2026-08-25T17:00:00Z"], now);
    expect(tabs).toHaveLength(8);
    expect(tabs.every((t) => t.count === 0)).toBe(true);
  });

  it("crosses a month boundary without repeating or skipping a date", () => {
    const tabs = buildDayTabs([], "2026-08-28T09:00:00Z");
    const keys = tabs.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("2026-08-31");
    expect(keys).toContain("2026-09-01");
  });

  it("crosses the autumn DST change without repeating or skipping a date", () => {
    // Prague falls back on 2026-10-25, making that a 25-hour day. A window
    // built by adding 86,400,000ms to a local midnight lands twice on the
    // 25th; this one is built from midday, which no offset shift can move.
    const tabs = buildDayTabs([], "2026-10-22T09:00:00Z");
    const keys = tabs.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("2026-10-24");
    expect(keys).toContain("2026-10-25");
    expect(keys).toContain("2026-10-26");
  });

  it("puts a late-evening game on the day the players would name it", () => {
    // 22:30Z on Monday is 00:30 Tuesday in Prague, and belongs to Tuesday.
    const tabs = buildDayTabs(["2026-08-03T22:30:00Z"], now);
    expect(tabs.find((t) => t.count > 0)!.key).toBe("2026-08-04");
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
    { key: "2026-08-03", weekday: "MON", dayOfMonth: "3", count: 1, isToday: true },
    { key: "2026-08-04", weekday: "TUE", dayOfMonth: "4", count: 0, isToday: false },
    { key: "2026-08-05", weekday: "WED", dayOfMonth: "5", count: 2, isToday: false },
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
