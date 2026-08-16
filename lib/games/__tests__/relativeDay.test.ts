import { describe, expect, it } from "vitest";
import { relativeDayLabel } from "@/lib/games/days";
import { resolveStrings } from "@/lib/i18n/resolve";

/**
 * The "Today / Tomorrow / the date" label shared by the home pills and the
 * games page (Section 2 item 7; Section 3 reuses it).
 *
 * BUILT ONCE ON PURPOSE. Two surfaces deciding independently what "today"
 * means is how one of them ends up a day out at a Prague midnight — and the
 * whole product's notion of which evening a game belongs to is the pitch's,
 * not the reader's.
 */
const en = resolveStrings("en");
const cs = resolveStrings("cs");

// Monday 3 August 2026, 11:00 in Prague.
const now = "2026-08-03T09:00:00Z";

describe("relativeDayLabel", () => {
  it("says Today for a game later the same Prague day", () => {
    expect(relativeDayLabel("2026-08-03T17:00:00Z", now, en)).toBe(en.games.dayToday);
  });

  it("says Tomorrow for the next Prague day", () => {
    expect(relativeDayLabel("2026-08-04T17:00:00Z", now, en)).toBe(en.games.dayTomorrow);
  });

  it("falls back to the date beyond tomorrow", () => {
    // The 8th of August 2026 is a Saturday. English is STATED — the default
    // locale is Czech now, so a bare call correctly renders `So 8. 8.`
    expect(relativeDayLabel("2026-08-08T17:00:00Z", now, en, "en")).toBe("Sat 8 Aug");
  });

  it("uses PRAGUE days, not UTC ones", () => {
    /*
     * 22:30Z on Monday is 00:30 Tuesday in Prague, so it is TOMORROW — a
     * label derived from the UTC date would say Today and be a day out for
     * exactly the late-evening games this product runs.
     */
    expect(relativeDayLabel("2026-08-03T22:30:00Z", now, en)).toBe(en.games.dayTomorrow);
  });

  it("says Today for a game earlier the same day, not a date", () => {
    // A game at 08:00 read at 11:00 is still today's game.
    expect(relativeDayLabel("2026-08-03T06:00:00Z", now, en)).toBe(en.games.dayToday);
  });

  it("translates both the relative words and the fallback date", () => {
    expect(relativeDayLabel("2026-08-03T17:00:00Z", now, cs, "cs")).toBe(cs.games.dayToday);
    // Czech renders its own weekday and its own date order.
    const distant = relativeDayLabel("2026-08-08T17:00:00Z", now, cs, "cs");
    expect(distant).not.toBe("Sat 8 Aug");
    expect(distant).toMatch(/8/);
  });
});
