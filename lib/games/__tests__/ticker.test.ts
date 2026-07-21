import { describe, expect, it } from "vitest";
import { tickerText } from "@/lib/games/ticker";
import { strings } from "@/lib/strings";

// 18:00 Europe/Prague in July (CEST, UTC+2).
const STARTS_AT = "2026-07-25T16:00:00.000Z";

describe("tickerText", () => {
  it("announces a game in progress with the venue and no time", () => {
    const text = tickerText({ venue: "Pražačka", startsAt: STARTS_AT, isLive: true });
    expect(text).toBe(`${strings.ticker.live} · Pražačka`);
  });

  it("announces an upcoming game with venue and Prague-local kick-off", () => {
    const text = tickerText({ venue: "Pražačka", startsAt: STARTS_AT, isLive: false });
    expect(text).toContain(strings.ticker.upcoming);
    expect(text).toContain("Pražačka");
    // Rendered in Europe/Prague, not raw UTC.
    expect(text).toContain("18:00");
    expect(text).not.toContain("16:00");
  });

  it("renders nothing when there is no game", () => {
    expect(tickerText(null)).toBeNull();
  });

  it("carries the venue through verbatim — escaping is the renderer's job", () => {
    const text = tickerText({
      venue: "<script>alert(1)</script>",
      startsAt: STARTS_AT,
      isLive: true,
    });
    expect(text).toContain("<script>alert(1)</script>");
  });
});
