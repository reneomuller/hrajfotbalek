import { describe, expect, it } from "vitest";
import { sinceJoined } from "@/lib/notifications/visibility";

/**
 * Owner, 2026-10-28: "every signed up profile starts with a clean
 * notifications slate". Production held seventeen announcements from August
 * and September, sent to everyone — and `my_notifications` showed every one
 * of them to an account created today.
 */
describe("sinceJoined", () => {
  const JOINED = "2026-10-28T09:00:00.000Z";
  const row = (id: string, createdAt: string) => ({ id, createdAt });

  it("drops what was sent before the account existed", () => {
    // Arrange
    const rows = [row("old-broadcast", "2026-09-16T10:03:44.475Z")];

    // Act
    const visible = sinceJoined(rows, JOINED);

    // Assert
    expect(visible).toEqual([]);
  });

  it("keeps what was sent at or after it, in the order given", () => {
    // Arrange
    const rows = [
      row("newer", "2026-10-29T08:00:00.000Z"),
      row("same-instant", JOINED),
      row("older", "2026-10-27T08:00:00.000Z"),
    ];

    // Act
    const visible = sinceJoined(rows, JOINED);

    // Assert
    expect(visible.map((r) => r.id)).toEqual(["newer", "same-instant"]);
  });

  it("keeps everything when the join date is unknown", () => {
    // Arrange
    const rows = [row("any", "2026-08-20T14:19:13.141Z")];

    // Act
    const visible = sinceJoined(rows, null);

    // Assert
    expect(visible).toEqual(rows);
  });
});
