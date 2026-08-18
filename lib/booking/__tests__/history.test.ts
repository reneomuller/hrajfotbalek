import { describe, expect, it } from "vitest";
import { splitHistory } from "@/lib/booking/history";
import type { BookingWithGame } from "@/lib/booking/queries";

const NOW = new Date("2026-08-01T12:00:00Z").getTime();

function row(
  hoursFromNow: number,
  status: string,
  attendance: string | null = null,
): BookingWithGame {
  const startsAt = new Date(NOW + hoursFromNow * 3_600_000).toISOString();
  return {
    booking: { id: `b${hoursFromNow}`, status, attendance } as never,
    game: { id: `g${hoursFromNow}`, starts_at: startsAt } as never,
    canCancel: false,
    refundable: true,
  };
}

describe("splitHistory", () => {
  it("puts active future bookings in upcoming, soonest first", () => {
    const { upcoming } = splitHistory(
      [row(72, "confirmed"), row(24, "reserved"), row(48, "confirmed")],
      NOW,
    );
    expect(upcoming.map((r) => r.game.starts_at)).toEqual([
      new Date(NOW + 24 * 3_600_000).toISOString(),
      new Date(NOW + 48 * 3_600_000).toISOString(),
      new Date(NOW + 72 * 3_600_000).toISOString(),
    ]);
  });

  it("puts everything already started in past, most recent first", () => {
    const { past } = splitHistory([row(-72, "confirmed"), row(-24, "confirmed")], NOW);
    expect(past[0].game.starts_at).toBe(new Date(NOW - 24 * 3_600_000).toISOString());
  });

  it("drops a cancelled booking on a future game from both lists", () => {
    // Nothing to attend, and nothing to look back on.
    const { upcoming, past } = splitHistory([row(24, "cancelled")], NOW);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
  });

  it("keeps a cancelled booking on a past game out of the played count", () => {
    const { past, gamesPlayed } = splitHistory([row(-24, "cancelled")], NOW);
    expect(past).toHaveLength(1);
    expect(gamesPlayed).toBe(0);
  });

  it("counts un-marked attendance as played", () => {
    // Attendance marking is an admin action that may not have happened.
    // Counting only `present` would make the number drift down whenever an
    // organizer forgot — a statement about the organizer, not the player.
    expect(splitHistory([row(-24, "confirmed", null)], NOW).gamesPlayed).toBe(1);
    expect(splitHistory([row(-24, "confirmed", "present")], NOW).gamesPlayed).toBe(1);
  });

  it("excludes a marked no-show from the played count and counts it separately", () => {
    const { gamesPlayed, noShows } = splitHistory([row(-24, "confirmed", "no_show")], NOW);
    expect(gamesPlayed).toBe(0);
    expect(noShows).toBe(1);
  });

  it("treats a game starting exactly now as past", () => {
    // Kickoff has happened; there is nothing left to cancel.
    const { upcoming, past } = splitHistory([row(0, "confirmed")], NOW);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("returns empty structures for a player with no bookings", () => {
    expect(splitHistory([], NOW)).toEqual({
      upcoming: [],
      past: [],
      gamesPlayed: 0,
      noShows: 0,
    });
  });
});
