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
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
          {t.auth.passwordLabel}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          data-testid="new-password"
          className="rounded-control border border-hairline-link bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-volt"
        />
        <span className="text-xs opacity-50">{t.auth.passwordHint}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        data-testid="save-password"
        className="rounded-cta bg-volt px-4 py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
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
        className="text-center text-sm text-white/60 underline underline-offset-4"
      >
        {t.auth.setPasswordSkip}
      </Link>
    </form>
  );
}
