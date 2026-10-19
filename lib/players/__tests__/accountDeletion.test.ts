import { describe, expect, it } from "vitest";
import { parseDeletionResult } from "@/lib/players/accountDeletion";

describe("parseDeletionResult", () => {
  it("reads what delete_player_account hands back for the server to remove", () => {
    // Arrange
    const raw = {
      auth_user_id: "41000000-0000-0000-0000-000000000001",
      photo_path: "players/4ddd0000-0000-0000-0000-000000000001.jpg",
      cover_path: null,
      bookings_cancelled: 2,
    };

    // Act
    const result = parseDeletionResult(raw);

    // Assert
    expect(result).toEqual({
      authUserId: "41000000-0000-0000-0000-000000000001",
      storagePaths: ["players/4ddd0000-0000-0000-0000-000000000001.jpg"],
      bookingsCancelled: 2,
    });
  });

  it("reads an already-deleted account (null) as nothing left to do", () => {
    // Arrange
    const raw = null;

    // Act
    const result = parseDeletionResult(raw);

    // Assert
    expect(result).toBeNull();
  });
});
