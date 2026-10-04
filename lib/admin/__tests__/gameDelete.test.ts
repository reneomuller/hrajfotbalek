import { describe, expect, it } from "vitest";
import { deleteErasesHistory } from "@/lib/admin/gameDelete";

/**
 * ROUND 39, ITEM 1 — which delete confirm the admin sees.
 *
 * A past game's bookings cascade away with it, so it leaves every player's
 * stats and history; the confirm has to say so before the button is pressed.
 */

const NOW = Date.parse("2026-10-04T12:00:00Z");
const FUTURE = "2026-10-10T18:00:00Z";
const PAST = "2026-09-20T18:00:00Z";

describe("deleteErasesHistory", () => {
  it("is true for a settled or played game", () => {
    // Arrange / Act
    const results = [
      deleteErasesHistory({ status: "settled", starts_at: PAST }, NOW),
      deleteErasesHistory({ status: "played", starts_at: PAST }, NOW),
    ];

    // Assert
    expect(results).toEqual([true, true]);
  });

  it("is true for a game that kicked off but was never marked played", () => {
    // Arrange / Act
    const result = deleteErasesHistory({ status: "published", starts_at: PAST }, NOW);

    // Assert
    expect(result).toBe(true);
  });

  it("is false for an upcoming game", () => {
    // Arrange / Act
    const result = deleteErasesHistory({ status: "published", starts_at: FUTURE }, NOW);

    // Assert
    expect(result).toBe(false);
  });

  it("is false for a cancelled game, past or not — it was never in anyone's stats", () => {
    // Arrange / Act
    const results = [
      deleteErasesHistory({ status: "cancelled", starts_at: PAST }, NOW),
      deleteErasesHistory({ status: "cancelled", starts_at: FUTURE }, NOW),
    ];

    // Assert
    expect(results).toEqual([false, false]);
  });
});
