import { describe, expect, it } from "vitest";
import {
  gameUrgency,
  lastFewThreshold,
  spotsLeftLabel,
  urgencyLabel,
} from "@/lib/games/urgency";
import { strings } from "@/lib/strings";

describe("lastFewThreshold", () => {
  /*
   * The reason the threshold is proportional rather than a flat 3: on a 12-spot
   * game three left is a quarter of the pitch, on a 24-spot game it is not, and
   * a flat number either cries wolf on the big games or stays quiet on the
   * small ones until the last spot.
   */
  it("scales with capacity, floored at 1 and capped at 3", () => {
    expect(lastFewThreshold(4)).toBe(1);
    expect(lastFewThreshold(8)).toBe(2);
    expect(lastFewThreshold(12)).toBe(3);
    expect(lastFewThreshold(24)).toBe(3);
  });

  it("never returns 0, so a game can always reach 'almost full'", () => {
    for (const capacity of [1, 2, 3, 5, 7]) {
      expect(lastFewThreshold(capacity)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("gameUrgency", () => {
  it("is open with room to spare", () => {
    expect(gameUrgency(0, 12)).toBe("open");
    expect(gameUrgency(8, 12)).toBe("open");
  });

  it("turns to lastFew at the threshold, not before", () => {
    // 12-spot game: threshold 3, so 9 booked (3 left) is the first rung.
    expect(gameUrgency(8, 12)).toBe("open");
    expect(gameUrgency(9, 12)).toBe("lastFew");
    expect(gameUrgency(11, 12)).toBe("lastFew");
  });

  it("is full at capacity", () => {
    expect(gameUrgency(12, 12)).toBe("full");
  });

  it("stays full when an admin drops capacity below the roster", () => {
    // Over-full is a real state: set_game_capacity refuses to go below the
    // ACTIVE booking count, but a cancelled-then-rebooked history can leave
    // the displayed count above capacity. It must never read as "spots open".
    expect(gameUrgency(14, 12)).toBe("full");
  });

  it("treats a zero-capacity game as full rather than open", () => {
    expect(gameUrgency(0, 0)).toBe("full");
  });
});

describe("spotsLeftLabel", () => {
  it("uses the singular on the last spot", () => {
    expect(spotsLeftLabel(11, 12)).toBe(`1 ${strings.games.spotLeft}`);
  });

  it("uses the plural above one", () => {
    expect(spotsLeftLabel(9, 12)).toBe(`3 ${strings.games.spotsLeft}`);
  });

  it("says full rather than '0 spots left'", () => {
    expect(spotsLeftLabel(12, 12)).toBe(strings.games.full);
    expect(spotsLeftLabel(13, 12)).toBe(strings.games.full);
  });
});

describe("urgencyLabel", () => {
  it("sources every rung from the strings table", () => {
    const copy = [
      strings.games.urgencyOpen,
      strings.games.urgencyLastFew,
      strings.games.urgencyFull,
    ];
    for (const rung of ["open", "lastFew", "full"] as const) {
      expect(copy).toContain(urgencyLabel(rung));
    }
  });

  it("gives each rung distinct copy — three rungs that read alike are one rung", () => {
    const labels = new Set(
      (["open", "lastFew", "full"] as const).map((r) => urgencyLabel(r)),
    );
    expect(labels.size).toBe(3);
  });
});
