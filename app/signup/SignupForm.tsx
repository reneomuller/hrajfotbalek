"use client";

import { useActionState } from "react";
import { completeSignup, type SignupFormState } from "./actions";
import { NICKNAME_MAX_LENGTH } from "@/lib/auth/nickname";
import { strings } from "@/lib/strings";

const initialState: SignupFormState = { status: "idle" };

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(completeSignup, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
          {strings.auth.nicknameLabel}
        </span>
        <input
          type="text"
          name="nickname"
          required
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          className="rounded border border-white/20 bg-transparent px-4 py-3 text-base outline-none focus:border-[var(--color-volt)]"
        />
        <span className="text-xs opacity-50">{strings.auth.nicknameHint}</span>
        {state.field === "nickname" && state.message ? (
          <span role="alert" className="text-sm text-red-400">
            {state.message}
          </span>
        ) : null}
      </label>

      {/* Consent and marketing are SEPARATE controls. Bundling them would make
          the consent non-specific, which is what makes it invalid. */}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="gdpr" className="mt-1" />
        <span>
          {strings.auth.gdprLabel}{" "}
          {/* /privacy is created in Phase 27, which owns the copy. Expected to
              404 until then. */}
          <a href="/privacy" className="underline opacity-70">
            {strings.auth.gdprLink}
          </a>
        </span>
      </label>
      {state.field === "gdpr" && state.message ? (
        <span role="alert" className="text-sm text-red-400">
          {state.message}
        </span>
      ) : null}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="marketing" className="mt-1" />
        <span>{strings.auth.marketingLabel}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--color-volt)] px-4 py-3 font-[family-name:var(--font-barlow-condensed)] text-lg font-extrabold uppercase italic tracking-wide text-black disabled:opacity-50"
      >
        {pending ? strings.common.loading : strings.auth.createAccount}
      </button>

      {state.status === "error" && !state.field && state.message ? (
        <p role="alert" className="text-sm text-red-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
