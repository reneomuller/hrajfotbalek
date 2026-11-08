import { normaliseCountry } from "@/lib/auth/countries";
import type { DirectoryPlayer } from "@/lib/admin/players/types";
import type { SkillLevel } from "@/lib/types/database";

/**
 * Where the players are from and what level they play at (round 42), over
 * COUNTED players only. Every counted player lands in exactly one row — a
 * country, "other", or "not set" — so the shares add up to the players tile.
 */

export interface CountryRow {
  /** An ISO code, or `other` for the folded tail, or `unset`. */
  key: string;
  value: number;
  /** On the `other` row: how many countries it folds together. */
  countries?: number;
}

/** How many countries get a row of their own before the rest are folded. */
export const TOP_COUNTRIES = 6;

export function countryBreakdown(players: DirectoryPlayer[], top: number = TOP_COUNTRIES): CountryRow[] {
  const byCode = new Map<string, number>();
  let unset = 0;
  for (const player of players) {
    if (player.kind !== "counted") continue;
    const code = normaliseCountry(player.country);
    if (code === null) unset += 1;
    else byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }

  const ranked = [...byCode.entries()]
    .sort(([codeA, a], [codeB, b]) => b - a || codeA.localeCompare(codeB))
    .map(([key, value]) => ({ key, value }));

  const rows: CountryRow[] = ranked.slice(0, top);
  const tail = ranked.slice(top);
  if (tail.length > 0) {
    rows.push({ key: "other", value: tail.reduce((sum, row) => sum + row.value, 0), countries: tail.length });
  }
  if (unset > 0) rows.push({ key: "unset", value: unset });
  return rows;
}

const SKILL_ORDER: readonly SkillLevel[] = ["beginner", "intermediate", "advanced"];

export interface SkillRow {
  key: SkillLevel | "unset";
  value: number;
}

/** Beginner to advanced, then "not set" — an order a reader already knows. */
export function skillBreakdown(players: DirectoryPlayer[]): SkillRow[] {
  const counted = players.filter((player) => player.kind === "counted");
  const rows: SkillRow[] = SKILL_ORDER.map((key) => ({
    key,
    value: counted.filter((player) => player.skillLevel === key).length,
  }));
  rows.push({ key: "unset", value: counted.filter((player) => player.skillLevel === null).length });
  return rows.filter((row) => row.value > 0);
}
