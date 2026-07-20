"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { validateNickname } from "@/lib/auth/nickname";
import { strings } from "@/lib/strings";

export interface SignupFormState {
  status: "idle" | "error";
  message?: string;
  field?: "nickname" | "gdpr";
}

/**
 * First-time account creation.
 *
 * Validation happens twice on purpose: once here for a friendly inline error,
 * and authoritatively inside `complete_signup`. A raw constraint violation must
 * never reach the user, and the two named failures — invalid charset vs already
 * taken — get distinct messages, because "try another name" and "that name is
 * not allowed" call for different actions from the person reading it.
 */
export async function completeSignup(
  _prevState: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const rawNickname = String(formData.get("nickname") ?? "");
  const gdpr = formData.get("gdpr") === "on";
  const marketing = formData.get("marketing") === "on";
  const next = String(formData.get("next") ?? "/games");

  const validation = validateNickname(rawNickname);
  if (!validation.valid) {
    return { status: "error", field: "nickname", message: strings.auth.nicknameInvalid };
  }

  // GDPR consent is required; marketing opt-in is independently optional.
  if (!gdpr) {
    return { status: "error", field: "gdpr", message: strings.auth.gdprRequired };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("complete_signup", {
    p_nickname: validation.value,
    p_gdpr_consent: true,
    p_marketing_opt_in: marketing,
  });

  if (error) {
    if (error.message.includes("NICKNAME_TAKEN")) {
      return { status: "error", field: "nickname", message: strings.auth.nicknameTaken };
    }
    if (error.message.includes("NICKNAME_INVALID")) {
      return { status: "error", field: "nickname", message: strings.auth.nicknameInvalid };
    }
    if (error.message.includes("CONSENT_REQUIRED")) {
      return { status: "error", field: "gdpr", message: strings.auth.gdprRequired };
    }
    return { status: "error", message: strings.errors.generic };
  }

  redirect(next.startsWith("/") ? next : "/games");
}
