"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setPassword, type LoginFormState } from "../actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/signupProfile";
import { useStrings } from "@/components/LocaleProvider";

const initialState: LoginFormState = { status: "idle" };

export function SetPasswordForm({ next }: { next: string }) {
  const t = useStrings();
  const [state, formAction, pending] = useActionState(setPassword, initialState);

  return (
    /* The product's panel treatment, like login and signup (round 9, item 8). */
    <form action={formAction} className="lifted mt-6 flex flex-col gap-4 rounded-card p-5">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-2">
        <span className="field-label">
          {t.auth.passwordLabel}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          data-testid="new-password"
          className="field"
        />
        <span className="text-xs opacity-50">{t.auth.passwordHint}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        data-testid="save-password"
        className="rounded-pill bg-volt px-4 py-[15px] text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.auth.setPasswordSubmit}
      </button>

      {state.status === "error" && state.message ? (
        <p role="alert" data-testid="set-password-error" className="text-sm text-red-400">
          {state.message}
        </p>
      ) : null}

      {/*
        The way out.

        R1 is "no existing player is locked out", and that is only true if this
        step cannot trap anyone. The session already exists by the time this
        page renders, so skipping costs nothing but another code next time —
        which is exactly the position the person was in a minute ago. A
        migration that can only be completed, never declined, is a migration
        that turns one bad password field into a support request.
      */}
      <Link
        href={next}
        data-testid="skip-password"
        className="text-center text-small font-semibold text-volt no-underline"
      >
        {t.auth.setPasswordSkip}
      </Link>
    </form>
  );
}
