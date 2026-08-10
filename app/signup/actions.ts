"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { getStrings } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/auth/origin";
import {
  parseSignupForm,
  signupMetadata,
  type SignupErrorCode,
  type SignupField,
} from "@/lib/auth/signupProfile";

/**
 * Signup, in two halves separated by the player's inbox.
 *
 * PHASE 2 INVERTS THE PHASE 1 FLOW. Before, a magic link established a session
 * and `/signup` then asked for a nickname — credential first, profile second.
 * Now the profile is collected up front and the credential is created with it,
 * which means the facts the player typed have to survive a round trip through
 * their email client before any row can be written.
 *
 * They travel in the auth user's metadata, set at `signUp()` and read back
 * after verification by `finishSignup()` on the page. Nothing is written to
 * `players` until a session exists, so a half-finished signup is always the
 * same recoverable state: a session with no player row, which is exactly the
 * state `destinationAfterAuth()` has always sent to `/signup`.
 *
 * TWO ENVIRONMENTS, TWO BRANCHES. With email confirmation ON — production —
 * `signUp()` returns a user and no session, and the player goes to their inbox.
 * With it OFF — the local stack, `enable_confirmations = false` — it returns a
 * session immediately. Both are handled here rather than assumed, because the
 * one that is never exercised locally is the one that runs in production.
 */

import { submittedValues, type SubmittedValues } from "./submittedValues";

export interface SignupFormState {
  status: "idle" | "error" | "verify";
  message?: string;
  field?: SignupField;
  /** Echoed back so the verify screen can name the address. */
  email?: string;
  /**
   * Everything the player typed, returned on EVERY error path so the form
   * re-renders with their work intact. Absent on success and on the initial
   * render. The password is deliberately not in it — see `submittedValues`.
   */
  values?: SubmittedValues;
}

/** Maps a parse failure onto the copy for that field. */
async function messageFor(code: SignupErrorCode): Promise<string> {
  const t = await getStrings();
  switch (code) {
    case "EMAIL_INVALID":
      return t.auth.emailInvalid;
    case "PASSWORD_TOO_SHORT":
      return t.auth.passwordTooShort;
    case "NICKNAME_INVALID":
      return t.auth.nicknameInvalid;
    case "COUNTRY_INVALID":
      return t.auth.countryInvalid;
    case "SKILL_REQUIRED":
      return t.auth.skillRequired;
    case "TOS_REQUIRED":
      return t.auth.tosRequired;
    case "CONSENT_REQUIRED":
      return t.auth.gdprRequired;
  }
}

/**
 * Creates the account and sends the verification email.
 *
 * The nickname is NOT checked for availability here, and could not usefully be:
 * there is no session yet, and an anonymous "is this nickname free" endpoint is
 * a player-enumeration surface for the sake of a few seconds. If the name is
 * taken by the time the player verifies, `finishSignup()` returns them the form
 * with that one error — recoverable, and rare enough not to design around.
 */
export async function startSignup(
  _prevState: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const t = await getStrings();

  const parsed = parseSignupForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      field: parsed.field,
      message: await messageFor(parsed.code),
      values: submittedValues(formData),
    };
  }

  const submission = parsed.value;
  const next = String(formData.get("next") ?? "/games");
  const supabase = await createServerSupabaseClient();

  // Same callback the magic link uses, so verification lands on the shared
  // post-auth path — funnel event, shadow claim, resume — rather than on a
  // second route that would have to reimplement all three.
  const callback = new URL("/auth/callback", await siteOrigin());
  callback.searchParams.set("action", "login");
  if (next.startsWith("/")) callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signUp({
    email: submission.email,
    password: submission.password,
    options: {
      emailRedirectTo: callback.toString(),
      data: signupMetadata(submission),
    },
  });

  if (error) {
    // Supabase reports an existing address in more than one shape depending on
    // whether "confirm email" is on, so the check is on substance rather than
    // an exact string.
    const detail = error.message.toLowerCase();
    if (detail.includes("already registered") || detail.includes("already exists")) {
      return {
        status: "error",
        field: "email",
        message: t.auth.emailTaken,
        values: submittedValues(formData),
      };
    }
    if (detail.includes("password")) {
      return {
        status: "error",
        field: "password",
        message: t.auth.passwordTooShort,
        values: submittedValues(formData),
      };
    }
    console.error("signUp failed", error.message);
    return {
      status: "error",
      message: t.auth.signupFailed,
      values: submittedValues(formData),
    };
  }

  // Confirmation OFF (the local stack): a session already exists, so the
  // profile can be written now and the player never sees a waiting room.
  if (data.session) {
    const written = await writeProfileFromMetadata();
    if (written.ok) redirect(next.startsWith("/") ? next : "/games");
    return {
      status: "error",
      field: written.field,
      message: written.message,
      values: submittedValues(formData),
    };
  }

  // Confirmation ON (production): nothing exists in `players` yet, and will not
  // until the link is opened. That is the point — an unverified address must
  // not occupy a nickname.
  return { status: "verify", email: submission.email };
}

export interface ProfileWriteResult {
  ok: boolean;
  field?: SignupField;
  message?: string;
}

/**
 * Writes the player row from the metadata left by `startSignup()`.
 *
 * Called after verification, when a session exists and no player row does.
 * Every failure mode returns rather than throws, so the caller can render the
 * form instead of a stack trace: the person on the other side has proved they
 * own their email address and must not be stranded.
 */
export async function writeProfileFromMetadata(): Promise<ProfileWriteResult> {
  const t = await getStrings();
  const supabase = await createServerSupabaseClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: t.errors.generic };

  const { profileFromMetadata } = await import("@/lib/auth/signupProfile");
  const profile = profileFromMetadata(
    user.user_metadata as Record<string, unknown> | null,
    user.email ?? "",
  );

  // No usable metadata: a session from before this flow existed, or a bag
  // written by an older build. The caller shows the form.
  if (!profile) return { ok: false };

  const { error } = await supabase.rpc("complete_signup_v2", {
    p_nickname: profile.nickname,
    p_gdpr_consent: true,
    p_tos_accepted: true,
    p_tos_version: profile.tosVersion,
    p_country: profile.country,
    p_skill_level: profile.skillLevel,
    p_marketing_opt_in: profile.marketingOptIn,
    p_phone: profile.phone,
  });

  if (error) {
    if (error.message.includes("NICKNAME_TAKEN")) {
      return { ok: false, field: "nickname", message: t.auth.nicknameTaken };
    }
    if (error.message.includes("NICKNAME_INVALID")) {
      return { ok: false, field: "nickname", message: t.auth.nicknameInvalid };
    }
    console.error("complete_signup_v2 failed", error.message);
    return { ok: false, message: t.errors.generic };
  }

  return { ok: true };
}

/**
 * The finish-your-profile form: a session exists, the player row does not.
 *
 * Reached when the metadata path could not complete — a nickname taken while
 * the verification mail sat unread, or a session that predates this flow. It
 * asks for the profile only; the account and its password already exist.
 */
export async function finishSignup(
  _prevState: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const t = await getStrings();
  const supabase = await createServerSupabaseClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  // The email and password are already settled, so the shared parser is fed the
  // address from the session and a placeholder secret it will not look at.
  const proxy = new FormData();
  for (const key of ["nickname", "country", "skill", "phone", "tos", "gdpr", "marketing"]) {
    const value = formData.get(key);
    if (value !== null) proxy.set(key, value);
  }
  proxy.set("email", user.email ?? "");
  proxy.set("password", "x".repeat(64));

  const parsed = parseSignupForm(proxy);
  if (!parsed.ok) {
    return {
      status: "error",
      field: parsed.field,
      message: await messageFor(parsed.code),
      values: submittedValues(formData),
    };
  }

  const { error } = await supabase.rpc("complete_signup_v2", {
    p_nickname: parsed.value.nickname,
    p_gdpr_consent: true,
    p_tos_accepted: true,
    p_tos_version: parsed.value.tosVersion,
    p_country: parsed.value.country,
    p_skill_level: parsed.value.skillLevel,
    p_marketing_opt_in: parsed.value.marketingOptIn,
    p_phone: parsed.value.phone,
  });

  if (error) {
    if (error.message.includes("NICKNAME_TAKEN")) {
      return {
        status: "error",
        field: "nickname",
        message: t.auth.nicknameTaken,
        values: submittedValues(formData),
      };
    }
    if (error.message.includes("NICKNAME_INVALID")) {
      return {
        status: "error",
        field: "nickname",
        message: t.auth.nicknameInvalid,
        values: submittedValues(formData),
      };
    }
    console.error("complete_signup_v2 failed", error.message);
    return {
      status: "error",
      message: t.errors.generic,
      values: submittedValues(formData),
    };
  }

  const next = String(formData.get("next") ?? "/games");
  redirect(next.startsWith("/") ? next : "/games");
}
