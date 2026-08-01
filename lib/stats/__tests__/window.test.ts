import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAT_WINDOW,
  isStatWindow,
  readStatWindow,
  statRange,
} from "@/lib/stats/window";

/**
 * REQ-ADMIN-006 — the day/week/month maths.
 *
 * Written against fixed UTC instants, so these hold whatever the host timezone
 * is. The DST cases are the ones worth having: Prague is UTC+1 or UTC+2
 * depending on the date, and a window computed by adding a fixed offset is
 * wrong for a fortnight twice a year — silently, in a direction nobody checks.
 */

/** The Prague wall-clock rendering of an ISO instant, for readable assertions. */
function prague(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(",", "");
}

describe("statRange — day", () => {
  it("spans one Prague calendar day, midnight to midnight", () => {
    // 2026-08-02 12:00Z is 14:00 in Prague (CEST).
    const range = statRange("day", new Date("2026-08-02T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-08-02 00:00");
    expect(prague(range.to)).toBe("2026-08-03 00:00");
  });

  it("puts a late-evening instant on the day the players would name", () => {
    // 22:30Z on the 2nd is 00:30 on the 3rd in Prague.
    const range = statRange("day", new Date("2026-08-02T22:30:00Z"));
    expect(prague(range.from)).toBe("2026-08-03 00:00");
  });

  it("is right in winter, when Prague is UTC+1", () => {
    const range = statRange("day", new Date("2026-01-15T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-01-15 00:00");
    expect(prague(range.to)).toBe("2026-01-16 00:00");
  });
});

describe("statRange — week", () => {
  it("starts on Monday and runs seven days", () => {
    // 2026-08-05 is a Wednesday.
    const range = statRange("week", new Date("2026-08-05T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-08-03 00:00"); // Monday
    expect(prague(range.to)).toBe("2026-08-10 00:00"); // the next Monday
  });

  it("keeps a Sunday in the week that started the Monday before it", () => {
    // The failure this guards: a Sunday-start week would put Saturday and
    // Sunday fixtures in different weeks, which is not how a football weekend
    // is counted.
    const range = statRange("week", new Date("2026-08-09T12:00:00Z")); // Sunday
    expect(prague(range.from)).toBe("2026-08-03 00:00");
    expect(prague(range.to)).toBe("2026-08-10 00:00");
  });

  it("spans a week correctly across the spring DST transition", () => {
    // Prague springs forward on Sunday 2026-03-29. The week containing it
    // starts Monday the 23rd and is 167 hours long, not 168.
    const range = statRange("week", new Date("2026-03-25T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-03-23 00:00");
    expect(prague(range.to)).toBe("2026-03-30 00:00");

    const hours = (Date.parse(range.to) - Date.parse(range.from)) / 3_600_000;
    expect(hours).toBe(167);
  });

  it("spans a week correctly across the autumn DST transition", () => {
    // Prague falls back on Sunday 2026-10-25: that week is 169 hours.
    const range = statRange("week", new Date("2026-10-21T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-10-19 00:00");
    expect(prague(range.to)).toBe("2026-10-26 00:00");

    const hours = (Date.parse(range.to) - Date.parse(range.from)) / 3_600_000;
    expect(hours).toBe(169);
  });
});

describe("statRange — month", () => {
  it("spans one calendar month", () => {
    const range = statRange("month", new Date("2026-08-15T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-08-01 00:00");
    expect(prague(range.to)).toBe("2026-09-01 00:00");
  });

  it("rolls the year over in December", () => {
    const range = statRange("month", new Date("2026-12-15T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-12-01 00:00");
    expect(prague(range.to)).toBe("2027-01-01 00:00");
  });

  it("handles February in a non-leap year", () => {
    const range = statRange("month", new Date("2026-02-10T12:00:00Z"));
    expect(prague(range.from)).toBe("2026-02-01 00:00");
    expect(prague(range.to)).toBe("2026-03-01 00:00");
  });
});

describe("range boundaries", () => {
  it("is half-open, so consecutive windows neither overlap nor leave a gap", () => {
    const first = statRange("day", new Date("2026-08-02T12:00:00Z"));
    const second = statRange("day", new Date("2026-08-03T12:00:00Z"));
    expect(first.to).toBe(second.from);
  });

  it("ends at the start of the next period, not at `now`", () => {
    // A bound at `now` would move on every refresh, and would exclude a game
    // kicking off later today — which belongs to today.
    const range = statRange("day", new Date("2026-08-02T09:00:00Z"));
    expect(Date.parse(range.to)).toBeGreaterThan(Date.parse("2026-08-02T09:00:00Z"));
  });
});

describe("readStatWindow", () => {
  it("accepts the three windows", () => {
    expect(readStatWindow({ window: "day" })).toBe("day");
    expect(readStatWindow({ window: "week" })).toBe("week");
    expect(readStatWindow({ window: "month" })).toBe("month");
  });

  it("falls back to the default for anything else", () => {
    expect(readStatWindow({ window: "year" })).toBe(DEFAULT_STAT_WINDOW);
    expect(readStatWindow({ window: "'; drop table events;--" })).toBe(DEFAULT_STAT_WINDOW);
    expect(readStatWindow({})).toBe(DEFAULT_STAT_WINDOW);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(readStatWindow({ window: ["month", "day"] })).toBe("month");
  });

  it("rejects a non-string", () => {
    expect(isStatWindow(7)).toBe(false);
    expect(isStatWindow(null)).toBe(false);
  });
});
