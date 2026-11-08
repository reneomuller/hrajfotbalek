import type { DirectoryPlayer } from "@/lib/admin/players/types";

let sequence = 0;

/** A signed-up player who has done nothing yet; override what a test is about. */
export function aPlayer(overrides: Partial<DirectoryPlayer> = {}): DirectoryPlayer {
  sequence += 1;
  return {
    id: `p${sequence}`,
    nickname: `Player ${sequence}`,
    email: null,
    phone: null,
    kind: "counted",
    isAdmin: false,
    isOrganizer: false,
    isBanned: false,
    playerNumber: sequence,
    photoPath: null,
    createdAt: "2026-09-01T10:00:00Z",
    country: null,
    skillLevel: null,
    marketingOptIn: false,
    balanceCzk: 0,
    bookingCount: 0,
    gamesPlayed: 0,
    lastGameAt: null,
    unfinishedCheckoutAt: null,
    ...overrides,
  };
}
