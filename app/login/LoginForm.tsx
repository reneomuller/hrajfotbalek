"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginFormState } from "./actions";
import { strings } from "@/lib/strings";

const initialState: LoginFormState = { status: "idle" };

export function LoginForm({
  gameId,
  action,
  next,
}: {
  gameId: string | null;
  action: string;
  next: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      {/* Carried into redirectTo so the booking intent survives the inbox round-trip. */}
      <input type="hidden" name="gameId" value={gameId ?? ""} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="next" value={next ?? ""} />

      <label className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
          {strings.auth.emailLabel}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={strings.auth.emailPlaceholder}
          className="rounded border border-white/20 bg-transparent px-4 py-3 text-base outline-none focus:border-[var(--color-volt)]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--color-volt)] px-4 py-3 font-[family-name:var(--font-barlow-condensed)] text-lg font-extrabold uppercase italic tracking-wide text-black disabled:opacity-50"
      >
        {pending ? strings.common.loading : strings.auth.sendLink}
      </button>

      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          className={`text-sm ${state.status === "error" ? "text-red-400" : "opacity-80"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
