import type { SkillLevel } from "@/lib/types/database";

/**
 * What a players row IS, for the admin's numbers (round 42, the admin rebuild).
 *
 * `counted` is exactly `isCountedPlayer` — signed up, not deleted, not seed —
 * and is the only kind any count, segment or breakdown includes. The other
 * three are listed behind their own tabs so an admin can still find them.
 */
export type PlayerKind = "counted" | "shadow" | "seed" | "deleted";

/** One row of the players list, with everything its columns and segments read. */
export interface DirectoryPlayer {
  id: string;
  nickname: string;
  email: string | null;
  phone: string | null;
  kind: PlayerKind;
  isAdmin: boolean;
  isOrganizer: boolean;
  isBanned: boolean;
  /** Null until the player-number migration is applied. */
  playerNumber: number | null;
  photoPath: string | null;
  createdAt: string;
  country: string | null;
  skillLevel: SkillLevel | null;
  marketingOptIn: boolean;
  /** `SUM(credit_ledger.delta_czk)` — the ledger is the authority. */
  balanceCzk: number;
  /** Every booking row, whatever became of it — the figure the list has always shown. */
  bookingCount: number;
  /** Distinct games played: kicked off, not cancelled out of, not a no-show. */
  gamesPlayed: number;
  /** Kick-off of the most recent game played, or null. */
  lastGameAt: string | null;
  /** When the checkout that was never finished started, or null. */
  unfinishedCheckoutAt: string | null;
}
