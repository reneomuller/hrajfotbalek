import { describe, expect, it } from "vitest";
import { profileStats, thirdStat } from "@/lib/profile/stats";
import type { BookingWithGame } from "@/lib/booking/queries";

/**
 * The three profile figures.
 *
 * The cases that matter are all EXCLUSIONS — a fold that adds things up is
 * trivially right on the happy path and wrong in exactly the places it should
 * have said no. So most of what follows is a row that must not be counted.
 */

function row({
  bookingStatus = "confirmed",
  gameStatus = "settled",
  venueId = "venue-1",
  durationMinutes = 60,
  id = "1",
}: {
  bookingStatus?: string;
  gameStatus?: string;
  venueId?: string | null;
  durationMinutes?: number | null;
  id?: string;
} = {}): BookingWithGame {
  return {
    booking: { id: `b${id}`, status: bookingStatus } as never,
    game: {
      id: `g${id}`,
      status: gameStatus,
      venue_id: venueId,
      duration_minutes: durationMinutes,
    } as never,
    canCancel: false,
    refundable: true,
  };
}

describe("profileStats", () => {
  it("counts a held booking on a game that has been played", () => {
    // Arrange
    const rows = [row({ bookingStatus: "confirmed", gameStatus: "played" })];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.gamesPlayed).toBe(1);
  });

  it("counts a reserved booking, not only a confirmed one", () => {
    // A spot held to the end is a game played, whether or not the payment was
    // ever confirmed — the money is a separate question from the football.

    // Arrange
    const rows = [row({ bookingStatus: "reserved", gameStatus: "settled" })];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.gamesPlayed).toBe(1);
  });

  it("does not count a game that has not happened yet", () => {
    // The whole point of the game-status half: a counter that rises when you
    // book is a counter measuring intent.

    // Arrange
    const rows = [
      row({ gameStatus: "published", id: "1" }),
      row({ gameStatus: "full", id: "2" }),
    ];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.hours).toBe(0);
    expect(stats.venues).toBe(0);
  });

  it("does not count a cancelled or expired booking on a played game", () => {
    // Arrange
    const rows = [
      row({ bookingStatus: "cancelled", id: "1" }),
      row({ bookingStatus: "expired", id: "2" }),
    ];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.gamesPlayed).toBe(0);
  });

  it("sums hours across played games, one decimal", () => {
    // Arrange
    const rows = [
      row({ durationMinutes: 90, id: "1" }),
      row({ durationMinutes: 60, id: "2" }),
      row({ durationMinutes: 45, id: "3" }),
    ];

    // Act
    const stats = profileStats(rows);

    // Assert — 195 minutes is 3.25 hours, reported to one decimal.
    expect(stats.hours).toBe(3.3);
  });

  it("resolves a null duration through policy rather than summing it as zero", () => {
    // Every game created before `duration_minutes` existed carries null. Zero
    // would report a regular's history an hour short per game while staying
    // perfectly plausible, which is the failure worth a test.

    // Arrange
    const rows = [row({ durationMinutes: null })];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.hours).toBe(1);
  });

  it("counts distinct pitches, not distinct games", () => {
    // Arrange — three games, two pitches.
    const rows = [
      row({ venueId: "venue-a", id: "1" }),
      row({ venueId: "venue-a", id: "2" }),
      row({ venueId: "venue-b", id: "3" }),
    ];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.venues).toBe(2);
  });

  it("drops a null venue rather than counting it as a pitch", () => {
    // Migration 19 backfilled every historic game, so a null here is a game
    // with no venue at all — not a pitch anyone has played on.

    // Arrange
    const rows = [row({ venueId: null, id: "1" }), row({ venueId: "venue-a", id: "2" })];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats.venues).toBe(1);
  });

  it("reports three zeroes for a player with no bookings at all", () => {
    // Arrange
    const rows: BookingWithGame[] = [];

    // Act
    const stats = profileStats(rows);

    // Assert
    expect(stats).toEqual({ gamesPlayed: 0, hours: 0, venues: 0 });
  });
});

describe("thirdStat", () => {
  const stats = { gamesPlayed: 9, hours: 9, venues: 4 };

  it("shows pitches played while the database cannot count players met", () => {
    // Arrange / Act
    const cell = thirdStat(stats, null);

    // Assert — this is the state PRODUCTION is in on deploy day, before the
    // owner applies 20260830100000_players_met.
    expect(cell).toEqual({ key: "venues", value: 4 });
  });

  it("shows players met once the database can count it", () => {
    // Arrange / Act / Assert
    expect(thirdStat(stats, 7)).toEqual({ key: "met", value: 7 });
  });

  it("shows a real zero rather than falling back to pitches", () => {
    // Arrange / Act / Assert — zero is a fact about the player and null is a
    // fact about the database; conflating them is the whole bug this guards.
    expect(thirdStat(stats, 0)).toEqual({ key: "met", value: 0 });
  });
});
