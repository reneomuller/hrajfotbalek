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
          className="rounded-control border border-hairline-link bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-volt"
        />
      </label>

      {/*
        A real submit button, so Enter inside the field and a tap both work.
        It was previously painted with `bg-[var(--color-volt)]` — a variable
        nothing defines, which rendered black text on a transparent block and
        made the only way forward invisible. Colour comes from the theme token.
      */}
      <button
        type="submit"
        disabled={pending}
        className="rounded-cta bg-volt px-4 py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
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
