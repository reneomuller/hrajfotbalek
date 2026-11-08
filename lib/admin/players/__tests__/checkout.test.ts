import { describe, expect, it } from "vitest";
import { unfinishedCheckouts, type CheckoutHistory } from "@/lib/admin/players/checkout";

/**
 * Who started paying and never finished (round 42): a card checkout for a game
 * (`checkout_sessions` still open or expired) or a Game Pass purchase
 * (`credit_topups` still pending) with nothing completed SINCE — no paid
 * checkout, no confirmed purchase, no booking made afterwards.
 */

const T1 = "2026-11-01T10:00:00Z";
const T2 = "2026-11-02T10:00:00Z";
const T3 = "2026-11-03T10:00:00Z";

function history(overrides: Partial<CheckoutHistory> = {}): CheckoutHistory {
  return { sessions: [], topups: [], bookings: [], ...overrides };
}

describe("unfinishedCheckouts", () => {
  it("flags a card checkout left open or expired", () => {
    // Arrange
    const input = history({
      sessions: [
        { playerId: "p1", status: "open", createdAt: T1 },
        { playerId: "p2", status: "expired", createdAt: T2 },
      ],
    });

    // Act
    const unfinished = unfinishedCheckouts(input);

    // Assert
    expect(Object.fromEntries(unfinished)).toEqual({ p1: T1, p2: T2 });
  });

  it("flags a Game Pass purchase still pending", () => {
    const unfinished = unfinishedCheckouts(
      history({ topups: [{ playerId: "p1", status: "pending", createdAt: T1 }] }),
    );
    expect(unfinished.get("p1")).toBe(T1);
  });

  it("leaves out a purchase somebody cancelled — that was a decision, not an abandoned checkout", () => {
    const unfinished = unfinishedCheckouts(
      history({ topups: [{ playerId: "p1", status: "cancelled", createdAt: T1 }] }),
    );
    expect(unfinished.size).toBe(0);
  });

  it("does not flag a checkout that was paid, or a purchase that was confirmed", () => {
    // Arrange
    const input = history({
      sessions: [
        { playerId: "p1", status: "booked", createdAt: T1 },
        { playerId: "p2", status: "credited", createdAt: T1 },
      ],
      topups: [{ playerId: "p3", status: "confirmed", createdAt: T1 }],
    });

    // Act
    const unfinished = unfinishedCheckouts(input);

    // Assert
    expect(unfinished.size).toBe(0);
  });

  it("clears an abandoned checkout once something is paid or booked after it", () => {
    // Arrange
    const input = history({
      sessions: [
        { playerId: "paidLater", status: "expired", createdAt: T1 },
        { playerId: "paidLater", status: "booked", createdAt: T2 },
        { playerId: "passLater", status: "expired", createdAt: T1 },
        { playerId: "bookedLater", status: "expired", createdAt: T1 },
      ],
      topups: [{ playerId: "passLater", status: "confirmed", createdAt: T2 }],
      bookings: [{ playerId: "bookedLater", status: "confirmed", createdAt: T2 }],
    });

    // Act
    const unfinished = unfinishedCheckouts(input);

    // Assert
    expect(unfinished.size).toBe(0);
  });

  it("keeps flagging when the only success came before the abandoned attempt", () => {
    // Arrange
    const input = history({
      sessions: [
        { playerId: "p1", status: "booked", createdAt: T1 },
        { playerId: "p1", status: "expired", createdAt: T2 },
      ],
      bookings: [{ playerId: "p1", status: "confirmed", createdAt: T1 }],
    });

    // Act
    const unfinished = unfinishedCheckouts(input);

    // Assert
    expect(unfinished.get("p1")).toBe(T2);
  });

  it("does not let an expired booking count as a success", () => {
    const unfinished = unfinishedCheckouts(
      history({
        topups: [{ playerId: "p1", status: "pending", createdAt: T1 }],
        bookings: [{ playerId: "p1", status: "expired", createdAt: T2 }],
      }),
    );
    expect(unfinished.get("p1")).toBe(T1);
  });

  it("reports the most recent unfinished attempt", () => {
    const unfinished = unfinishedCheckouts(
      history({
        sessions: [{ playerId: "p1", status: "expired", createdAt: T1 }],
        topups: [{ playerId: "p1", status: "pending", createdAt: T3 }],
      }),
    );
    expect(unfinished.get("p1")).toBe(T3);
  });
});
