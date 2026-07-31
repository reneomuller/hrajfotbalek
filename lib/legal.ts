/**
 * Which revision of the legal documents a player is being asked to accept.
 *
 * Stamped onto `players.tos_version` by `complete_signup_v2` and rendered on
 * `/terms`, so the record of what someone agreed to and the document they were
 * shown cannot drift apart. Every acceptance is recorded against this string —
 * so it changes when, and only when, the words change.
 *
 * 1.0 is the human-authored text delivered 2026-08-01 and effective from that
 * date, in `content/terms.en.md` (authoritative) and `content/terms.cs.md`.
 */
export const TERMS_VERSION = "1.0" as const;

/**
 * The privacy policy has NOT been delivered.
 *
 * Terms of service and a privacy policy are different documents, and only the
 * first arrived. `/privacy` therefore keeps its DRAFT banner and this version
 * keeps saying draft — contract §3.1 and v2.5 §8 both forbid generated legal
 * copy, and a plausible-looking generated policy is the specific failure mode
 * they exist to prevent: it gets shipped.
 *
 * This matters more than a placeholder page usually would, because the signup
 * form's second required box is a GDPR data-processing consent that links here.
 * Asking someone to consent to a document that does not exist is the one part
 * of signup that cannot be fixed after launch.
 */
export const PRIVACY_VERSION = "draft-2026-07" as const;
