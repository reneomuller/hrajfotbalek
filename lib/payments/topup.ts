/**
 * Top-up amounts.
 *
 * In their own module because `app/account/topup/actions.ts` carries
 * `"use server"`, and a server-action file may export nothing but async
 * functions — a plain `const` there is a build error, not a lint warning. The
 * client form and the action both need these numbers, so they live where both
 * can import them.
 *
 * The bounds are duplicated in `create_topup` and in a CHECK on the table, and
 * that is the intended arrangement: these give a friendly message, the RPC
 * gives a named error, and the constraint makes the range true of the data
 * regardless of who is writing.
 */
export const TOPUP_PRESETS = [150, 300, 450] as const;
export const TOPUP_MIN_CZK = 50;
export const TOPUP_MAX_CZK = 2000;
