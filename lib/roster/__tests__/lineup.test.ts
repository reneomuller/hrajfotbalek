import { describe, expect, it } from "vitest";
import type { RosterAvatar } from "@/lib/games/queries";
import { toRosterAvatar } from "@/lib/games/queries";
import { lineupOrder } from "@/lib/roster/lineup";

/**
 * The order of the game page's lineup (the owner, 2026-11-12): "the guests are
 * last in the column. Let's have the guest under the user that selected the
 * guest instead, not all at the end".
 */
function player(nickname: string): RosterAvatar {
  return { nickname, photoPath: null, isGuest: false, guestOf: null, guestIndex: null, gamesPlayed: 0 };
}
function guestOf(host: string, index: number): RosterAvatar {
  return { nickname: null, photoPath: null, isGuest: true, guestOf: host, guestIndex: index, gamesPlayed: 0 };
}
function houseGuest(index: number): RosterAvatar {
  return { nickname: null, photoPath: null, isGuest: true, guestOf: null, guestIndex: index, gamesPlayed: 0 };
}
const label = (seat: RosterAvatar) =>
  seat.nickname ?? (seat.guestOf ? `${seat.guestOf}+${seat.guestIndex}` : `house+${seat.guestIndex}`);

describe("lineupOrder", () => {
  it("puts each guest straight under the player who brought them", () => {
    // Arrange — in the order the view happens to return them.
    const seats = [guestOf("Ben", 2), player("Ben"), guestOf("Anna", 1), guestOf("Ben", 1), player("Anna")];

    // Act
    const order = lineupOrder(seats).map(label);

    // Assert
    expect(order).toEqual(["Anna", "Anna+1", "Ben", "Ben+1", "Ben+2"]);
  });

  it("keeps the house guests — nobody's guests — at the end", () => {
    // Arrange
    const seats = [houseGuest(1), player("Ben"), guestOf("Ben", 1)];

    // Act
    const order = lineupOrder(seats).map(label);

    // Assert
    expect(order).toEqual(["Ben", "Ben+1", "house+1"]);
  });

  it("puts a named shadow after the signed-up players, with its own guests under it", () => {
    // Arrange — a shadow is a name an admin booked: a guest with a nickname.
    const shadow: RosterAvatar = { ...player("Karel"), isGuest: true };
    const seats = [guestOf("Karel", 1), shadow, player("Zoe")];

    // Act
    const order = lineupOrder(seats).map(label);

    // Assert
    expect(order).toEqual(["Zoe", "Karel", "Karel+1"]);
  });
});

describe("toRosterAvatar", () => {
  it("carries each player's own games count, so it cannot end up beside somebody else", () => {
    // Arrange — the count used to be read back by POSITION from the unsorted
    // rows, so once the list was sorted every player showed another's number.
    const row = { nickname: "Anna", photo_path: null, is_guest: false, guest_of: null, guest_index: null, games_played: 7 };

    // Act / Assert
    expect(toRosterAvatar(row).gamesPlayed).toBe(7);
  });
});
