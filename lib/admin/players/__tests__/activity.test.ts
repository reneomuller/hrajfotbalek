import { describe, expect, it } from "vitest";
import {
  hasKickedOff,
  historyFigures,
  summariseActivity,
  type ActivityBooking,
  type ActivityGame,
} from "@/lib/admin/players/activity";

/**
 * What a player has PLAYED (round 42): a game that kicked off — marked played
 * or settled, or simply past its start and not cancelled — on a booking they
 * did not cancel, where they were not marked a no-show. The same rule as the
 * player's own account page (`lib/booking/history.ts`), so the two agree.
 */

const NOW = Date.parse("2026-11-08T12:00:00Z");
const PAST = "2026-11-01T18:00:00Z";
const EARLIER = "2026-10-20T18:00:00Z";
const FUTURE = "2026-11-15T18:00:00Z";

function game(id: string, startsAt: string, status: ActivityGame["status"] = "published"): ActivityGame {
  return { id, startsAt, status };
}

function booking(overrides: Partial<ActivityBooking> & Pick<ActivityBooking, "playerId" | "gameId">): ActivityBooking {
  return { status: "confirmed", attendance: null, ...overrides };
}

describe("hasKickedOff", () => {
  it("is true for a game marked played or settled", () => {
    expect(hasKickedOff(game("g", FUTURE, "played"), NOW)).toBe(true);
    expect(hasKickedOff(game("g", FUTURE, "settled"), NOW)).toBe(true);
  });

  it("is true for a published or full game past its start", () => {
    expect(hasKickedOff(game("g", PAST, "published"), NOW)).toBe(true);
    expect(hasKickedOff(game("g", PAST, "full"), NOW)).toBe(true);
  });

  it("is false for a game still ahead", () => {
    expect(hasKickedOff(game("g", FUTURE), NOW)).toBe(false);
  });

  it("is false for a cancelled game or a draft, whenever it was", () => {
    expect(hasKickedOff(game("g", PAST, "cancelled"), NOW)).toBe(false);
    expect(hasKickedOff(game("g", PAST, "draft"), NOW)).toBe(false);
  });
});

describe("summariseActivity", () => {
  it("counts a confirmed booking on a game that kicked off, and its date", () => {
    // Arrange
    const games = [game("g1", PAST)];
    const bookings = [booking({ playerId: "p1", gameId: "g1" })];

    // Act
    const activity = summariseActivity(bookings, games, NOW).get("p1");

    // Assert
    expect(activity).toEqual({ gamesPlayed: 1, lastGameAt: PAST, bookingCount: 1 });
  });

  it("counts an unpaid cash booking that kicked off, as the player's own page does", () => {
    const activity = summariseActivity(
      [booking({ playerId: "p1", gameId: "g1", status: "reserved" })],
      [game("g1", PAST)],
      NOW,
    ).get("p1");
    expect(activity?.gamesPlayed).toBe(1);
  });

  it("does not count a no-show, a cancelled or expired booking, or a game still ahead", () => {
    // Arrange
    const games = [game("g1", PAST), game("g2", PAST), game("g3", PAST), game("g4", FUTURE)];
    const bookings = [
      booking({ playerId: "p1", gameId: "g1", attendance: "no_show" }),
      booking({ playerId: "p1", gameId: "g2", status: "cancelled" }),
      booking({ playerId: "p1", gameId: "g3", status: "expired" }),
      booking({ playerId: "p1", gameId: "g4" }),
    ];

    // Act
    const activity = summariseActivity(bookings, games, NOW).get("p1");

    // Assert
    expect(activity).toEqual({ gamesPlayed: 0, lastGameAt: null, bookingCount: 4 });
  });

  it("counts each game once and keeps the latest kick-off", () => {
    // Arrange
    const games = [game("g1", EARLIER, "settled"), game("g2", PAST, "played")];
    const bookings = [
      booking({ playerId: "p1", gameId: "g1", status: "cancelled" }),
      booking({ playerId: "p1", gameId: "g1" }),
      booking({ playerId: "p1", gameId: "g2" }),
    ];

    // Act
    const activity = summariseActivity(bookings, games, NOW).get("p1");

    // Assert
    expect(activity).toEqual({ gamesPlayed: 2, lastGameAt: PAST, bookingCount: 3 });
  });

  it("keeps players apart, and a booking whose game was not read counts as a booking only", () => {
    // Arrange
    const bookings = [
      booking({ playerId: "p1", gameId: "g1" }),
      booking({ playerId: "p2", gameId: "missing" }),
    ];

    // Act
    const activity = summariseActivity(bookings, [game("g1", PAST)], NOW);

    // Assert
    expect(activity.get("p1")?.gamesPlayed).toBe(1);
    expect(activity.get("p2")).toEqual({ gamesPlayed: 0, lastGameAt: null, bookingCount: 1 });
  });
});

describe("historyFigures", () => {
  it("reads games played, the last one and the no-shows from a player's history rows", () => {
    // Arrange
    const rows = [
      { status: "confirmed" as const, attendance: null, hasStarted: false, startsAt: FUTURE },
      { status: "confirmed" as const, attendance: "present" as const, hasStarted: true, startsAt: PAST },
      { status: "reserved" as const, attendance: null, hasStarted: true, startsAt: EARLIER },
      { status: "confirmed" as const, attendance: "no_show" as const, hasStarted: true, startsAt: EARLIER },
      { status: "cancelled" as const, attendance: null, hasStarted: true, startsAt: EARLIER },
    ];

    // Act
    const figures = historyFigures(rows);

    // Assert
    expect(figures).toEqual({ gamesPlayed: 2, lastGameAt: PAST, noShows: 1 });
  });

  it("has no last game for a player who has not played", () => {
    expect(historyFigures([])).toEqual({ gamesPlayed: 0, lastGameAt: null, noShows: 0 });
  });
});
