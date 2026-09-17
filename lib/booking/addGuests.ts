/**
 * The add-guest action's state shape (round 27, item 2).
 *
 * IT LIVES HERE BECAUSE A `"use server"` FILE MAY EXPORT ONLY ASYNC FUNCTIONS.
 * The initial state was exported from `app/game/[id]/add-guests/actions.ts`
 * alongside the action, and Next refused the whole module at runtime — `A
 * "use server" file can only export async functions, found object` — which
 * took the GAME DETAIL PAGE down with it, not just the panel. Six e2e specs
 * failed on a claim bar that never left `full`, none of them about guests.
 *
 * A type would have been fine: types are erased. A `const` is not.
 */
export interface AddGuestsState {
  status: "idle" | "error";
  /** A product error code the panel maps to copy, never a raw message. */
  code?: "CAPACITY_FULL" | "CREDIT_NEGATIVE_BLOCKED"
  | "GAME_NOT_CREDIT_ELIGIBLE" | "FAILED";
}

export const ADD_GUESTS_INITIAL: AddGuestsState = { status: "idle" };
