import { describe, expect, it } from "vitest";
import { isCountedPlayer } from "@/lib/admin/playerScope";
import {
  inSegment,
  parseSegment,
  playerKind,
  playerKpis,
  segmentCounts,
} from "@/lib/admin/players/segments";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";
import { aPlayer } from "./fixtures";

/**
 * Who is in which tab of the players list (round 42). The owner: "don't count
 * shadow accounts that we regularly use for booking games and other stuff" —
 * so a shadow is in no count and no segment but its own.
 */

const signedUp = { auth_user_id: "auth-1", deleted_at: null, is_seed: false };

describe("playerKind", () => {
  it("calls a signed-up account counted", () => {
    expect(playerKind(signedUp)).toBe("counted");
  });

  it("calls an account with no login a shadow", () => {
    expect(playerKind({ ...signedUp, auth_user_id: null })).toBe("shadow");
  });

  it("calls a seed fixture seed", () => {
    expect(playerKind({ ...signedUp, is_seed: true })).toBe("seed");
  });

  it("calls a deleted account deleted, although deleting also removes its login", () => {
    expect(playerKind({ auth_user_id: null, deleted_at: "2026-10-20T10:00:00Z", is_seed: false })).toBe(
      "deleted",
    );
  });

  it("agrees with isCountedPlayer about every combination", () => {
    // Arrange
    const combinations = [null, "auth-1"].flatMap((auth) =>
      [null, "2026-10-20T10:00:00Z"].flatMap((deleted) =>
        [false, true].map((seed) => ({ auth_user_id: auth, deleted_at: deleted, is_seed: seed })),
      ),
    );

    // Act
    const disagreements = combinations.filter(
      (fields) => (playerKind(fields) === "counted") !== isCountedPlayer(fields),
    );

    // Assert
    expect(disagreements).toEqual([]);
  });
});

describe("parseSegment", () => {
  it("reads a known segment from the query", () => {
    expect(parseSegment("came-back")).toBe("came-back");
  });

  it("falls back to all for anything else", () => {
    expect(parseSegment("everyone")).toBe("all");
    expect(parseSegment(undefined)).toBe("all");
  });

  it("reads the first value when the query repeats it", () => {
    expect(parseSegment(["shadow", "all"])).toBe("shadow");
  });
});

describe("inSegment", () => {
  it("puts a counted player in all, and never a shadow, seed or deleted account", () => {
    // Arrange
    const counted = aPlayer();
    const others = [aPlayer({ kind: "shadow" }), aPlayer({ kind: "seed" }), aPlayer({ kind: "deleted" })];

    // Act / Assert
    expect(inSegment(counted, "all")).toBe(true);
    expect(others.filter((p) => inSegment(p, "all"))).toEqual([]);
  });

  it("keeps a shadow out of every segment but its own, even one that has played", () => {
    // Arrange
    const shadow = aPlayer({ kind: "shadow", gamesPlayed: 4, bookingCount: 4, balanceCzk: 900 });

    // Act
    const segments = (["played", "came-back", "has-credit", "never-booked", "not-counted"] as const).filter(
      (segment) => inSegment(shadow, segment),
    );

    // Assert
    expect(segments).toEqual([]);
    expect(inSegment(shadow, "shadow")).toBe(true);
  });

  it("puts seed and deleted accounts behind the deleted & test tab", () => {
    expect(inSegment(aPlayer({ kind: "seed" }), "not-counted")).toBe(true);
    expect(inSegment(aPlayer({ kind: "deleted" }), "not-counted")).toBe(true);
    expect(inSegment(aPlayer({ kind: "shadow" }), "not-counted")).toBe(false);
  });

  it("calls a player who played one game played but not came back", () => {
    const once = aPlayer({ gamesPlayed: 1, bookingCount: 1 });
    expect(inSegment(once, "played")).toBe(true);
    expect(inSegment(once, "came-back")).toBe(false);
  });

  it("calls a player with two games came back", () => {
    expect(inSegment(aPlayer({ gamesPlayed: 2, bookingCount: 2 }), "came-back")).toBe(true);
  });

  it("calls a player with no booking at all never booked", () => {
    expect(inSegment(aPlayer(), "never-booked")).toBe(true);
    expect(inSegment(aPlayer({ bookingCount: 1 }), "never-booked")).toBe(false);
  });

  it("needs a whole Credit for has Credit — a smaller balance buys no seat", () => {
    expect(inSegment(aPlayer({ balanceCzk: PASS_REFERENCE_PRICE_CZK }), "has-credit")).toBe(true);
    expect(inSegment(aPlayer({ balanceCzk: PASS_REFERENCE_PRICE_CZK - 1 }), "has-credit")).toBe(false);
  });

  it("finds an unfinished checkout and a marketing opt-in", () => {
    expect(inSegment(aPlayer({ unfinishedCheckoutAt: "2026-11-01T10:00:00Z" }), "unfinished-checkout")).toBe(true);
    expect(inSegment(aPlayer(), "unfinished-checkout")).toBe(false);
    expect(inSegment(aPlayer({ marketingOptIn: true }), "opted-in")).toBe(true);
    expect(inSegment(aPlayer(), "opted-in")).toBe(false);
  });
});

describe("segmentCounts", () => {
  it("counts every segment over the same list", () => {
    // Arrange
    const players = [
      aPlayer({ gamesPlayed: 3, bookingCount: 3, marketingOptIn: true }),
      aPlayer({ gamesPlayed: 1, bookingCount: 1 }),
      aPlayer(),
      aPlayer({ kind: "shadow", bookingCount: 2, gamesPlayed: 2 }),
      aPlayer({ kind: "deleted" }),
    ];

    // Act
    const counts = segmentCounts(players);

    // Assert
    expect(counts).toEqual({
      all: 3,
      played: 2,
      "came-back": 1,
      "never-booked": 1,
      "has-credit": 0,
      "unfinished-checkout": 0,
      "opted-in": 1,
      shadow: 1,
      "not-counted": 1,
    });
  });
});

describe("playerKpis", () => {
  it("reads the came-back share among players who played at least once", () => {
    // Arrange
    const players = [
      aPlayer({ gamesPlayed: 5, bookingCount: 5 }),
      aPlayer({ gamesPlayed: 2, bookingCount: 2 }),
      aPlayer({ gamesPlayed: 1, bookingCount: 1 }),
      aPlayer(),
    ];

    // Act
    const kpis = playerKpis(players);

    // Assert
    expect(kpis.players).toBe(4);
    expect(kpis.played).toBe(3);
    expect(kpis.cameBack).toBe(2);
    expect(kpis.cameBackPercent).toBe(67);
  });

  it("has no came-back share when nobody has played", () => {
    expect(playerKpis([aPlayer()]).cameBackPercent).toBeNull();
  });

  it("counts Credit holders and the whole Credits they hold", () => {
    // Arrange
    const players = [
      aPlayer({ balanceCzk: PASS_REFERENCE_PRICE_CZK * 3 + 20 }),
      aPlayer({ balanceCzk: PASS_REFERENCE_PRICE_CZK }),
      aPlayer({ balanceCzk: 50 }),
    ];

    // Act
    const kpis = playerKpis(players);

    // Assert
    expect(kpis.withCredit).toBe(2);
    expect(kpis.creditsHeld).toBe(4);
  });

  it("counts opt-ins and leaves shadows, seed and deleted accounts out of every figure", () => {
    // Arrange
    const players = [
      aPlayer({ marketingOptIn: true }),
      aPlayer({ kind: "shadow", marketingOptIn: true, gamesPlayed: 3, balanceCzk: 900 }),
      aPlayer({ kind: "seed", marketingOptIn: true, gamesPlayed: 3 }),
      aPlayer({ kind: "deleted" }),
    ];

    // Act
    const kpis = playerKpis(players);

    // Assert
    expect(kpis).toMatchObject({ players: 1, optedIn: 1, played: 0, withCredit: 0, shadows: 1 });
  });
});
