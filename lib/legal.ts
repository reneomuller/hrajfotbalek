/**
 * Which revision of the legal documents a player is being asked to accept.
 *
 * Stamped onto `players.tos_version` by `complete_signup_v2` and rendered on
 * `/terms`, so the record of what someone agreed to and the document they were
 * shown cannot drift apart.
 *
 * IT SAYS "DRAFT" BECAUSE IT IS ONE. `content/terms.md` ships as a marked
 * placeholder until Oliver supplies the real text (contract §3.1, the same
 * convention as the privacy page). A version string of `v1` would quietly claim
 * otherwise, and the first question anyone asks of a consent record is what
 * exactly was on the screen. When the real copy lands, this bumps — and the
 * players who accepted the draft remain distinguishable from those who did not,
 * which is the entire point of storing a version at all.
 */
export const TERMS_VERSION = "draft-2026-07" as const;

/** Bumped independently: the two documents change on their own schedules. */
export const PRIVACY_VERSION = "draft-2026-07" as const;
