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
/*
 * ~~`TOPUP_PRESETS = [150, 300, 450]`.~~ DELETED (round 35 v2, item 2).
 *
 * IT WAS A SECOND COPY OF THE GAME PRICE — one game, two, three — hard-coded
 * rather than derived, so it would still have read 150/300/450 the day the
 * price moved to 180. And nothing imported it: the audit for a second copy
 * found it and the audit for its callers found none, so the fix is a deletion
 * rather than a derivation. A constant that is both wrong and unused is the
 * cheapest kind to remove and the easiest to miss.
 */
export const TOPUP_MIN_CZK = 50;
export const TOPUP_MAX_CZK = 2000;
