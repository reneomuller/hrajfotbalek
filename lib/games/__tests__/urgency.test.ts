import { describe, expect, it } from "vitest";
import {
  gameUrgency,
  lastFewThreshold,
  spotsLeftCount,
  spotsLeftLabel,
  spotsTone,
  urgencyLabel,
} from "@/lib/games/urgency";
import { resolveStrings } from "@/lib/i18n/resolve";
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

describe("spotsTone", () => {
  /*
   * v1.2 §5.5 — the COLOUR ladder, which is absolute where `gameUrgency` is
   * proportional. Colour is read before the reader has taken in the capacity,
   * so it has to mean the same thing on every row of a list of differently
   * sized games.
   */
  it("is volt above ten spots, amber at ten or fewer, red at three or fewer", () => {
    expect(spotsTone(0, 20)).toBe("plenty"); // 20 left
    expect(spotsTone(9, 20)).toBe("plenty"); // 11 left
    expect(spotsTone(10, 20)).toBe("few"); // 10 left
    expect(spotsTone(16, 20)).toBe("few"); // 4 left
    expect(spotsTone(17, 20)).toBe("critical"); // 3 left
    expect(spotsTone(19, 20)).toBe("critical"); // 1 left
    expect(spotsTone(20, 20)).toBe("full");
  });

  it("reports full rather than critical when nothing is left", () => {
    // "0 spots left" in red would be an alarm about a decision nobody can act
    // on. Full is a state, not an urgency.
    expect(spotsTone(12, 12)).toBe("full");
    expect(spotsTone(13, 12)).toBe("full"); // overbooked, somehow
    expect(spotsTone(0, 0)).toBe("full");
  });

  it("DISAGREES with the copy ladder on a large half-empty game, deliberately", () => {
    // 16-spot game, 4 left: amber, because four spots is few in absolute terms
    // and that is what a colour must say consistently. The eyebrow still reads
    // "spots open", because four of sixteen is not proportionally urgent.
    // Recorded here so the next reader does not "fix" them into agreement.
    expect(spotsTone(12, 16)).toBe("few");
    expect(gameUrgency(12, 16)).toBe("open");
  });

  it("counts spots without going negative", () => {
    expect(spotsLeftCount(9, 12)).toBe(3);
    expect(spotsLeftCount(15, 12)).toBe(0);
    expect(spotsLeftCount(-4, 12)).toBe(12);
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
    expect(spotsLeftLabel(11, 12)).toBe("1 spot left");
  });

  it("uses the plural above one", () => {
    expect(spotsLeftLabel(9, 12)).toBe("3 spots left");
  });

  it("says full rather than '0 spots left'", () => {
    expect(spotsLeftLabel(12, 12)).toBe(strings.games.full);
    expect(spotsLeftLabel(13, 12)).toBe(strings.games.full);
  });

  /*
   * THE 2-4 FORM, WHICH IS THE ONE THE OLD RULE GOT WRONG (round 22).
   *
   * `left === 1 ? spotLeft : spotsLeft` is an English two-form rule, and it
   * rendered the 5+ form for three free spots in every Slavic language. Three
   * free spots is not an edge case on this row — it is the state a filling
   * game spends its last day in.
   */
  it.each([
    ["cs", 1, "1 volné místo"],
    ["cs", 3, "3 volná místa"],
    ["cs", 5, "5 volných míst"],
    ["ru", 1, "1 место свободно"],
    ["ru", 3, "3 места свободно"],
    ["ru", 5, "5 мест свободно"],
    ["uk", 1, "1 місце вільне"],
    ["uk", 3, "3 місця вільні"],
    ["uk", 5, "5 місць вільно"],
  ] as const)("renders %s at %i as its own form", (locale, left, expected) => {
    // Arrange
    const capacity = 12;
    const t = resolveStrings(locale);

    // Act
    const label = spotsLeftLabel(capacity - left, capacity, locale, t);

    // Assert
    expect(label).toBe(expected);
  });

  it("puts the Ukrainian teens in the many bucket, not the 2-4 one", () => {
    // Arrange / Act / Assert — 12 ends in 2 and is NOT "12 місця вільні".
    const t = resolveStrings("uk");
    expect(spotsLeftLabel(0, 12, "uk", t)).toBe("12 місць вільно");
    expect(spotsLeftLabel(2, 22, "uk", t)).toBe("20 місць вільно");
    // …and 22 goes back into the 2-4 bucket, which is the pair that proves
    // CLDR is deciding rather than a modulus.
    expect(spotsLeftLabel(0, 22, "uk", t)).toBe("22 місця вільні");
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
