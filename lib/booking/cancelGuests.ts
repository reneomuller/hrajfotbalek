/**
 * The shape `cancelGuestsAction` answers with (round 34, item 4).
 *
 * ITS OWN MODULE FOR THE SAME REASON `addGuests.ts` IS ONE: a `"use server"`
 * file may export nothing but async functions, so the initial state and the
 * type a client component imports cannot live beside the action.
 */
export type CancelGuestsErrorCode =
  | "CANCEL_WINDOW_CLOSED"
  | "INVALID_GUEST_COUNT"
  | "FAILED";

export type CancelGuestsState =
  | { status: "idle" }
  | { status: "error"; code: CancelGuestsErrorCode };

export const CANCEL_GUESTS_INITIAL: CancelGuestsState = { status: "idle" };
