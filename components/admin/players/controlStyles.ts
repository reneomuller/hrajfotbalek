/**
 * The player page's buttons, drawn one way (round 42, the admin rebuild).
 *
 * They were three styles in one panel — chips, 10px tracked capitals in a
 * square box, and a filled bar — so two buttons doing the same kind of thing
 * looked unrelated. Now every control is the admin nav's chip at a 44px target:
 * a quiet outline, volt for the act that adds something, danger for the ones
 * that take something away, and a solid fill only on the press that commits.
 */
const CHIP =
  "inline-flex min-h-11 items-center justify-center rounded-pill border px-4 text-small font-semibold transition-colors disabled:opacity-50";

/** An everyday act. */
export const chipQuiet = `${CHIP} border-hairline-strong text-bone hover:border-volt hover:text-volt`;

/** The act that adds — make admin, give Credit. */
export const chipVolt = `${CHIP} border-hairline-strong text-volt hover:border-volt`;

/** The act that takes away, or cannot be undone. */
export const chipDanger = `${CHIP} border-danger/60 text-danger hover:border-danger`;

/** The press that commits a form. */
export const chipPrimary = `${CHIP} border-volt bg-volt font-bold text-ink`;

/** The press that commits something destructive. */
export const chipDangerSolid = `${CHIP} border-danger bg-danger font-bold text-ink`;

/** A field inside a player-page form. */
export const fieldInput =
  "h-11 rounded-control border border-hairline-strong bg-surface px-3 text-body text-bone placeholder:text-faint focus:border-volt";

/** The label above such a field. */
export const fieldLabel = "text-[10px] uppercase tracking-eyebrow text-muted";
