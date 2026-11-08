import type { PitchSeason } from "@/lib/types/database";

/**
 * The venues page's pitch cost area and season switch (round 42, the admin
 * rebuild) — the decisions the form makes before it asks the database.
 *
 * SQL IS THE AUTHORITY. `set_venue_pitch_costs` refuses a cost outside
 * `pitch_cost_max_czk()` and `set_pitch_season` anything but the two seasons;
 * this module exists so a wrong box is NAMED beside the box rather than
 * reported for the whole form after a round trip.
 */

/**
 * The highest pitch cost an admin may type — a typo guard, not a price. A copy
 * of `public.pitch_cost_max_czk()`, pinned to its newest definition by
 * `__tests__/pitchCosts.test.ts`.
 */
export const PITCH_COST_MAX_CZK = 100_000;

/** The switch's two positions, in the order the owner named them. */
export const PITCH_SEASONS: readonly PitchSeason[] = ["winter", "summer"];

/** A venue's two prices, as `getVenuePitchCosts()` returns them. */
export interface PitchCostPair {
  summerCzk: number;
  winterCzk: number;
}

export type PitchCostField = "summer" | "winter";

export type PitchCostFormResult =
  | { ok: true; summerCzk: number; winterCzk: number }
  | { ok: false; invalid: PitchCostField[] };

/** Spaces of either kind: `1 200` is how a Czech admin writes twelve hundred. */
const GROUPING_SPACES = /[\s  ]/g;
const WHOLE_NUMBER = /^\d+$/;

/**
 * A typed cost in whole crowns, or null when it is not one.
 *
 * AN EMPTY BOX IS NOT ZERO. Clearing a field and saving must not make a pitch
 * free; zero is a cost an admin types on purpose. A comma is refused rather
 * than read as a thousands separator, because in Czech it is the decimal one.
 */
export function parseWholeCzk(raw: FormDataEntryValue | Blob | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(GROUPING_SPACES, "");
  if (!WHOLE_NUMBER.test(digits)) return null;
  const value = Number(digits);
  return value <= PITCH_COST_MAX_CZK ? value : null;
}

/** Both of a venue's inputs, with every field that is wrong named, summer first. */
export function parsePitchCostForm(input: {
  summer: FormDataEntryValue | Blob | null | undefined;
  winter: FormDataEntryValue | Blob | null | undefined;
}): PitchCostFormResult {
  const summerCzk = parseWholeCzk(input.summer);
  const winterCzk = parseWholeCzk(input.winter);
  if (summerCzk !== null && winterCzk !== null) return { ok: true, summerCzk, winterCzk };

  const invalid: PitchCostField[] = [];
  if (summerCzk === null) invalid.push("summer");
  if (winterCzk === null) invalid.push("winter");
  return { ok: false, invalid };
}

/** What a game created now at this venue costs: its price for the current season. */
export function pitchCostInForce(costs: PitchCostPair, season: PitchSeason): number {
  return season === "summer" ? costs.summerCzk : costs.winterCzk;
}

/** The season switch's submitted value, or null for anything but the two seasons. */
export function parsePitchSeason(raw: FormDataEntryValue | Blob | null | undefined): PitchSeason | null {
  return raw === "summer" || raw === "winter" ? raw : null;
}
