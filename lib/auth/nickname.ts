/**
 * Nickname validation.
 *
 * The pattern is stated in three places and they must agree exactly:
 *   - `players_nickname_format` CHECK          (migration 20260720100000)
 *   - `complete_signup`                        (migration 20260720140000)
 *   - here, for the friendly inline error
 *
 * The database is the authority; this exists so a user sees "letters, numbers,
 * spaces, _ and -" instead of a raw constraint violation. A client-side pass
 * that disagreed with the CHECK would produce the worst outcome — a form that
 * looks valid and then fails on submit.
 */

/** Mirrors `players_nickname_format` exactly. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]{1,20}$/;

export const NICKNAME_MAX_LENGTH = 20;

export type NicknameError = "NICKNAME_INVALID" | "NICKNAME_TAKEN";

export type NicknameValidation =
  | { valid: true; value: string }
  | { valid: false; error: NicknameError };

/**
 * Validates the charset and length only. Uniqueness cannot be decided here —
 * it needs the database, and even a lookup would be racy — so a taken nickname
 * comes back from `complete_signup` as NICKNAME_TAKEN instead.
 */
export function validateNickname(input: string | null | undefined): NicknameValidation {
  if (typeof input !== "string") {
    return { valid: false, error: "NICKNAME_INVALID" };
  }

  // Trimmed before testing: a trailing space is almost always a typo rather
  // than intent, and the pattern would otherwise accept it and store it.
  const value = input.trim();

  if (!NICKNAME_PATTERN.test(value)) {
    return { valid: false, error: "NICKNAME_INVALID" };
  }

  return { valid: true, value };
}
