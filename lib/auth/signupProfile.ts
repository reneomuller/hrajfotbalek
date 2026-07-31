/**
 * The signup payload: validated once, carried through verification, spent once.
 *
 * WHY THIS MODULE EXISTS AT ALL. Phase 2 inverts the Phase 1 flow. The profile
 * is now collected BEFORE the credential is verified, which means the facts the
 * player typed have to survive a round trip through their email client before
 * anything can be written to `players`. They travel in the auth user's
 * metadata, set at `signUp()` and read back after verification.
 *
 * So the same shape is parsed from two very different sources — a form on the
 * way in, a metadata bag on the way back — and both must agree about what a
 * valid profile is. Validating in two places is how they stop agreeing.
 *
 * NOTHING HERE IS AUTHORIZATION. Every check below is repeated authoritatively
 * inside `complete_signup_v2`, which derives identity from `auth.uid()` and
 * enforces the same rules against the database. This layer exists to produce a
 * friendly, field-attributed error instead of a raw one — the same division of
 * labour Phase 1 established for the nickname.
 */

import { normaliseCountry } from "@/lib/auth/countries";
import { validateNickname } from "@/lib/auth/nickname";
import { TERMS_VERSION } from "@/lib/legal";

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/**
 * Mirrors the hosted project's password policy (contract §3.1).
 *
 * A client-side check is decoration: the API enforces whatever the project is
 * set to, which is why setting it to 8 is a G1 checklist item rather than a
 * line of code. This constant exists so the form can say "at least 8" before
 * the round trip, not so it can be the thing that enforces it.
 */
export const PASSWORD_MIN_LENGTH = 8;

export interface SignupProfile {
  email: string;
  nickname: string;
  country: string;
  skillLevel: SkillLevel;
  phone: string | null;
  marketingOptIn: boolean;
  tosVersion: string;
}

/** Everything the form collects, including the secret that is never stored. */
export interface SignupSubmission extends SignupProfile {
  password: string;
}

export type SignupField =
  | "email"
  | "password"
  | "nickname"
  | "country"
  | "skill"
  | "phone"
  | "tos"
  | "gdpr";

export type SignupParse =
  | { ok: true; value: SignupSubmission }
  | { ok: false; field: SignupField; code: SignupErrorCode };

export type SignupErrorCode =
  | "EMAIL_INVALID"
  | "PASSWORD_TOO_SHORT"
  | "NICKNAME_INVALID"
  | "COUNTRY_INVALID"
  | "SKILL_REQUIRED"
  | "TOS_REQUIRED"
  | "CONSENT_REQUIRED";

/**
 * Deliberately loose, exactly as in Phase 1: real validation is "did the mail
 * arrive", which no regex can answer. This only catches obvious typos before a
 * send is spent.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function str(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * An unchecked box submits nothing at all, so absence is the common case and
 * must read as false rather than as missing data. "on" is what a browser sends;
 * "true" is what a test or a programmatic caller tends to send.
 */
function checked(value: FormDataEntryValue | null | undefined): boolean {
  return value === "on" || value === "true";
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && (SKILL_LEVELS as readonly string[]).includes(value);
}

/**
 * Parses the signup form.
 *
 * Field order matches the form, so the first error a player sees is the first
 * problem on the page rather than whichever check happened to run first. The
 * two consents are checked LAST and separately: they are the two boxes at the
 * bottom, and a form that complains about consent before it complains about a
 * malformed email is describing the page in the wrong order.
 */
export function parseSignupForm(form: {
  get(name: string): FormDataEntryValue | null;
}): SignupParse {
  const email = str(form.get("email")).toLowerCase();
  if (!looksLikeEmail(email)) return { ok: false, field: "email", code: "EMAIL_INVALID" };

  const nickname = validateNickname(str(form.get("nickname")));
  if (!nickname.valid) return { ok: false, field: "nickname", code: "NICKNAME_INVALID" };

  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, field: "password", code: "PASSWORD_TOO_SHORT" };
  }

  const country = normaliseCountry(str(form.get("country")));
  if (!country) return { ok: false, field: "country", code: "COUNTRY_INVALID" };

  const skill = str(form.get("skill"));
  if (!isSkillLevel(skill)) return { ok: false, field: "skill", code: "SKILL_REQUIRED" };

  // Optional, and empty is a legitimate answer rather than a missing one.
  const phoneRaw = str(form.get("phone"));
  const phone = phoneRaw === "" ? null : phoneRaw;

  // The two required legal acts, separately (contract §3.1, ruled 2026-07-31).
  // Distinct codes so the form can point at the box that was not ticked.
  if (!checked(form.get("tos"))) return { ok: false, field: "tos", code: "TOS_REQUIRED" };
  if (!checked(form.get("gdpr"))) return { ok: false, field: "gdpr", code: "CONSENT_REQUIRED" };

  return {
    ok: true,
    value: {
      email,
      password,
      nickname: nickname.value,
      country,
      skillLevel: skill,
      phone,
      marketingOptIn: checked(form.get("marketing")),
      tosVersion: TERMS_VERSION,
    },
  };
}

/**
 * What `signUp()` stores on the auth user, so the profile survives the trip
 * through the player's inbox.
 *
 * THE PASSWORD IS NOT IN HERE, and neither is anything else that would be
 * embarrassing in a JWT. Supabase copies user metadata into the access token,
 * so this bag is readable by anyone holding the session — which is the player
 * themselves, and only facts they just typed about themselves.
 */
export function signupMetadata(submission: SignupSubmission): Record<string, unknown> {
  return {
    nickname: submission.nickname,
    country: submission.country,
    skill_level: submission.skillLevel,
    phone: submission.phone,
    marketing_opt_in: submission.marketingOptIn,
    tos_version: submission.tosVersion,
    // Recorded as facts about what was ticked, not as permission to skip the
    // check: `complete_signup_v2` still refuses unless both are true.
    tos_accepted: true,
    gdpr_consent: true,
  };
}

/**
 * Reads a profile back out of the metadata bag after verification.
 *
 * Returns null when anything is missing or no longer valid, and the caller then
 * shows the form instead. That is the recovery path for every awkward case at
 * once: a session created before this flow existed, a metadata bag written by
 * an older build, a nickname that someone else took while the verification mail
 * sat unread. None of them should strand a person who has just proved they own
 * their email address.
 */
export function profileFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  email: string,
): SignupProfile | null {
  if (!metadata) return null;

  const nickname = validateNickname(String(metadata.nickname ?? ""));
  if (!nickname.valid) return null;

  const country = normaliseCountry(
    typeof metadata.country === "string" ? metadata.country : null,
  );
  if (!country) return null;

  if (!isSkillLevel(metadata.skill_level)) return null;

  const tosVersion =
    typeof metadata.tos_version === "string" && metadata.tos_version.trim() !== ""
      ? metadata.tos_version.trim()
      : null;
  if (!tosVersion) return null;

  if (metadata.tos_accepted !== true || metadata.gdpr_consent !== true) return null;

  const phone = typeof metadata.phone === "string" && metadata.phone.trim() !== ""
    ? metadata.phone.trim()
    : null;

  return {
    email,
    nickname: nickname.value,
    country,
    skillLevel: metadata.skill_level,
    phone,
    marketingOptIn: metadata.marketing_opt_in === true,
    tosVersion,
  };
}
