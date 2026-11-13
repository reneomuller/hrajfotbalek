import { describe, expect, it } from "vitest";
import { googleCalendarUrl } from "@/lib/calendar/googleCalendar";

/**
 * "Add to calendar" opens Google Calendar on Android and iPhone alike (the
 * owner, 2026-11-13: "I'd like both android and iphone to prompt google
 * calendar and make it a one click addition"). The .ics download stays as the
 * second choice, for Apple and other calendars.
 */
const game = {
  venue: "Praha 3 • Pražačka",
  startsAt: "2026-11-20T17:00:00.000Z",
  durationMinutes: 90,
  url: "https://www.hrajfotbal.com/game/14",
};

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("googleCalendarUrl", () => {
  it("opens Google Calendar's new-event page", () => {
    // Act
    const url = new URL(googleCalendarUrl(game));

    // Assert
    expect(`${url.origin}${url.pathname}`).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
  });

  it("carries the game's start and end in UTC, the length included", () => {
    expect(params(googleCalendarUrl(game)).get("dates")).toBe("20261120T170000Z/20261120T183000Z");
  });

  it("falls back to the standard length for a game that recorded none, like the .ics", () => {
    expect(params(googleCalendarUrl({ ...game, durationMinutes: null })).get("dates")).toBe(
      "20261120T170000Z/20261120T180000Z",
    );
  });

  it("names the venue as the title and the place, Czech letters intact", () => {
    // Act
    const query = params(googleCalendarUrl(game));

    // Assert
    expect(query.get("text")).toBe("Praha 3 • Pražačka");
    expect(query.get("location")).toBe("Praha 3 • Pražačka");
  });

  it("links back to the game, and reads the time in Prague's zone", () => {
    // Act
    const query = params(googleCalendarUrl(game));

    // Assert
    expect(query.get("details")).toContain("https://www.hrajfotbal.com/game/14");
    expect(query.get("ctz")).toBe("Europe/Prague");
  });
});
