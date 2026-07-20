import { describe, expect, it } from "vitest";
import {
  DISPLAY_TIME_ZONE,
  formatCzk,
  formatGameDateTime,
  formatGameTime,
  formatTime,
} from "../format";

/**
 * These assertions are written against fixed UTC instants, so they hold
 * regardless of the host timezone. Run the suite under `TZ=America/Los_Angeles`
 * to prove the formatter is not silently falling back to the host zone.
 */
describe("format", () => {
  it("pins the display timezone to Europe/Prague", () => {
    expect(DISPLAY_TIME_ZONE).toBe("Europe/Prague");
  });

  it("renders a winter (CET, UTC+1) instant as Prague 24h time", () => {
    expect(formatGameTime("2026-01-15T17:30:00Z")).toBe("Thu 18:30");
  });

  it("renders a summer (CEST, UTC+2) instant as Prague 24h time", () => {
    expect(formatGameTime("2026-07-16T16:30:00Z")).toBe("Thu 18:30");
  });

  it("crosses the spring-forward DST boundary correctly", () => {
    // Prague jumps 02:00 -> 03:00 local at 01:00 UTC on 2026-03-29.
    expect(formatGameTime("2026-03-29T00:30:00Z")).toBe("Sun 01:30"); // still CET
    expect(formatGameTime("2026-03-29T01:30:00Z")).toBe("Sun 03:30"); // now CEST
  });

  it("handles the autumn fold, where one local time maps to two instants", () => {
    // Prague falls back 03:00 -> 02:00 local at 01:00 UTC on 2026-10-25, so
    // both of these distinct UTC instants legitimately render as 02:30.
    expect(formatGameTime("2026-10-25T00:30:00Z")).toBe("Sun 02:30");
    expect(formatGameTime("2026-10-25T01:30:00Z")).toBe("Sun 02:30");
  });

  it("never renders a 12-hour clock", () => {
    const evening = formatTime("2026-07-16T18:00:00Z"); // 20:00 Prague
    expect(evening).toBe("20:00");
    expect(evening).not.toMatch(/am|pm/i);
  });

  it("renders a full date-time for surfaces without date context", () => {
    expect(formatGameDateTime("2026-07-16T16:30:00Z")).toBe("Thu 16 Jul 18:30");
  });

  it("rejects an invalid datetime rather than rendering a bogus one", () => {
    expect(() => formatGameTime("not-a-date")).toThrow(TypeError);
  });

  it("renders whole-crown amounts", () => {
    expect(formatCzk(250)).toBe("250 CZK");
  });
});
