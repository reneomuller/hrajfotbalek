import { describe, expect, it } from "vitest";
import { latestCancelReasons } from "@/lib/admin/games/cancelReasons";

/**
 * Why each cancelled game was called off (round 42, the admin rebuild).
 * `cancel_game_with_reason` writes the admin's words onto the `game_cancelled`
 * event's metadata; the Cancelled tab reads them back.
 */
describe("latestCancelReasons", () => {
  it("reads the reason off each game's cancellation event", () => {
    // Arrange
    const events = [
      { game_id: "g1", created_at: "2026-11-01T10:00:00Z", metadata: { bookings_cancelled: 3, reason: "Waterlogged" } },
      { game_id: "g2", created_at: "2026-11-02T10:00:00Z", metadata: { reason: "Ground closed" } },
    ];

    // Act
    const reasons = latestCancelReasons(events);

    // Assert
    expect(Object.fromEntries(reasons)).toEqual({ g1: "Waterlogged", g2: "Ground closed" });
  });

  it("keeps the newest reason when a game carries more than one", () => {
    // Arrange
    const events = [
      { game_id: "g1", created_at: "2026-11-03T10:00:00Z", metadata: { reason: "Newer" } },
      { game_id: "g1", created_at: "2026-11-01T10:00:00Z", metadata: { reason: "Older" } },
    ];

    // Act
    const reasons = latestCancelReasons(events);

    // Assert
    expect(reasons.get("g1")).toBe("Newer");
  });

  it("leaves out a cancellation with no reason — one made before reasons were recorded", () => {
    // Arrange
    const events = [
      { game_id: "g1", created_at: "2026-11-01T10:00:00Z", metadata: { bookings_cancelled: 0 } },
      { game_id: "g2", created_at: "2026-11-01T10:00:00Z", metadata: { reason: "   " } },
      { game_id: "g3", created_at: "2026-11-01T10:00:00Z", metadata: null },
      { game_id: null, created_at: "2026-11-01T10:00:00Z", metadata: { reason: "Orphan" } },
    ];

    // Act
    const reasons = latestCancelReasons(events);

    // Assert
    expect(reasons.size).toBe(0);
  });

  it("trims the reason it keeps", () => {
    // Arrange
    const events = [{ game_id: "g1", created_at: "2026-11-01T10:00:00Z", metadata: { reason: "  Snow \n" } }];

    // Act
    const reasons = latestCancelReasons(events);

    // Assert
    expect(reasons.get("g1")).toBe("Snow");
  });
});
