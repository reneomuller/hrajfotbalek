import { creditsFromCzk } from "@/lib/admin/credits";
import type { PlayerScopeFields } from "@/lib/admin/playerScope";
import type { DirectoryPlayer, PlayerKind } from "@/lib/admin/players/types";

/**
 * The tabs of the players list, and the figures above it (round 42).
 *
 * EVERY COUNTED SEGMENT IS A SUBSET OF `all`, and `all` is `isCountedPlayer`:
 * the owner asked that shadow accounts — names he books onto games — count
 * nowhere. They, and the seed and deleted accounts, sit behind tabs of their
 * own so they can still be found.
 */

/** What kind of row this is. `counted` is exactly `isCountedPlayer`. */
export function playerKind(player: PlayerScopeFields): PlayerKind {
  if (player.deleted_at !== null) return "deleted";
  if (player.is_seed) return "seed";
  if (player.auth_user_id === null) return "shadow";
  return "counted";
}

export const PLAYER_SEGMENTS = [
  "all",
  "played",
  "came-back",
  "never-booked",
  "has-credit",
  "unfinished-checkout",
  "opted-in",
  "shadow",
  "not-counted",
] as const;

export type PlayerSegment = (typeof PLAYER_SEGMENTS)[number];

const SEGMENT_SET: ReadonlySet<string> = new Set(PLAYER_SEGMENTS);

function isSegment(value: string): value is PlayerSegment {
  return SEGMENT_SET.has(value);
}

/** The segment a `?segment=` asks for; anything unknown is `all`. */
export function parseSegment(raw: string | string[] | undefined): PlayerSegment {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && isSegment(value) ? value : "all";
}

/** A player has come back once they have played a second game. */
export const CAME_BACK_GAMES = 2;

const COUNTED_RULES: Record<Exclude<PlayerSegment, "shadow" | "not-counted">, (p: DirectoryPlayer) => boolean> = {
  all: () => true,
  played: (p) => p.gamesPlayed >= 1,
  "came-back": (p) => p.gamesPlayed >= CAME_BACK_GAMES,
  "never-booked": (p) => p.bookingCount === 0,
  // A whole Credit: a smaller balance buys no seat (CLAUDE.md, round 35).
  "has-credit": (p) => creditsFromCzk(p.balanceCzk) >= 1,
  "unfinished-checkout": (p) => p.unfinishedCheckoutAt !== null,
  "opted-in": (p) => p.marketingOptIn,
};

export function inSegment(player: DirectoryPlayer, segment: PlayerSegment): boolean {
  if (segment === "shadow") return player.kind === "shadow";
  if (segment === "not-counted") return player.kind === "seed" || player.kind === "deleted";
  return player.kind === "counted" && COUNTED_RULES[segment](player);
}

export function segmentCounts(players: DirectoryPlayer[]): Record<PlayerSegment, number> {
  const counts: Record<PlayerSegment, number> = {
    all: 0,
    played: 0,
    "came-back": 0,
    "never-booked": 0,
    "has-credit": 0,
    "unfinished-checkout": 0,
    "opted-in": 0,
    shadow: 0,
    "not-counted": 0,
  };
  for (const player of players) {
    for (const segment of PLAYER_SEGMENTS) {
      if (inSegment(player, segment)) counts[segment] += 1;
    }
  }
  return counts;
}

/** A whole-number share, or null when there is nothing to take a share of. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export interface PlayerKpis {
  /** Counted players — signed up, not deleted, not seed. */
  players: number;
  /** Shadow accounts, which are in none of the other figures. */
  shadows: number;
  played: number;
  cameBack: number;
  /** Came back as a share of those who played at least once. */
  cameBackPercent: number | null;
  /** Players holding at least one whole Credit. */
  withCredit: number;
  /** The whole Credits those players hold between them. */
  creditsHeld: number;
  optedIn: number;
}

export function playerKpis(players: DirectoryPlayer[]): PlayerKpis {
  const counted = players.filter((p) => p.kind === "counted");
  const played = counted.filter(COUNTED_RULES.played).length;
  const cameBack = counted.filter(COUNTED_RULES["came-back"]).length;
  const withCredit = counted.filter(COUNTED_RULES["has-credit"]);

  return {
    players: counted.length,
    shadows: players.filter((p) => p.kind === "shadow").length,
    played,
    cameBack,
    cameBackPercent: percentOf(cameBack, played),
    withCredit: withCredit.length,
    creditsHeld: withCredit.reduce((sum, p) => sum + creditsFromCzk(p.balanceCzk), 0),
    optedIn: counted.filter(COUNTED_RULES["opted-in"]).length,
  };
}
