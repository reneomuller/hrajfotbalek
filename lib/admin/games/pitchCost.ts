/**
 * The game page's pitch-cost correction box (round 42, the admin rebuild).
 *
 * EMPTY MEANS "BACK TO THE VENUE'S PRICE" — `set_game_pitch_cost` takes null
 * for exactly that — and a number is a cost typed by hand. Only the shape is
 * checked here (a whole number, not negative); the CEILING is the database's
 * `pitch_cost_max_czk()` and is deliberately not repeated: the RPC refuses past
 * it with `PITCH_COST_OUT_OF_RANGE`, which `lib/admin/errors.ts` already names.
 * A bound written in two places is a bound that ends up two different numbers.
 */
export type PitchCostInput = { ok: true; costCzk: number | null } | { ok: false };

const WHOLE_CROWNS = /^\d+$/;

export function parsePitchCostInput(raw: FormDataEntryValue | null): PitchCostInput {
  if (raw === null) return { ok: true, costCzk: null };
  if (typeof raw !== "string") return { ok: false };

  const text = raw.trim();
  if (text === "") return { ok: true, costCzk: null };
  if (!WHOLE_CROWNS.test(text)) return { ok: false };
  return { ok: true, costCzk: Number(text) };
}
