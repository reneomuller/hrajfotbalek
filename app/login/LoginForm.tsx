"use client";

import { useActionState } from "react";
import { requestMagicLink, verifyEmailOtp, type LoginFormState } from "./actions";
import { useStrings } from "@/components/LocaleProvider";

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
  const t = useStrings();
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <>
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      {/* Carried into redirectTo so the booking intent survives the inbox round-trip. */}
      <input type="hidden" name="gameId" value={gameId ?? ""} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="next" value={next ?? ""} />

      <label className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
          {t.auth.emailLabel}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t.auth.emailPlaceholder}
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
        {pending ? t.common.loading : t.auth.sendLink}
      </button>

      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          data-testid="login-status"
          className={`text-sm ${state.status === "error" ? "text-red-400" : "opacity-80"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>

    {/*
      The code box appears only after a send has succeeded — `state.email` is
      set by the action, so it doubles as "there is a code out there" and as
      the address to verify it against.
    */}
    {state.status === "sent" && state.email ? (
      <CodeForm email={state.email} gameId={gameId} action={action} next={next} />
    ) : null}
    </>
  );
}

/**
 * The second step: the six-digit code from the same email.
 *
 * Shown only once a code has actually been sent, because until then there is
 * nothing to type and an empty code box next to an empty email box is just a
 * question the visitor cannot answer.
 *
 * A SEPARATE `<form>`, not a second button on the first one. Two forms means
 * two independent `useActionState` pairs, so a wrong code leaves the sent-link
 * confirmation on screen instead of replacing it — the person still has a
 * working link in their inbox, and the UI should not imply otherwise.
 */
function CodeForm({
  email,
  gameId,
  action,
  next,
}: {
  email: string;
  gameId: string | null;
  action: string;
  next: string | null;
}) {
  const t = useStrings();
  const [state, formAction, pending] = useActionState(verifyEmailOtp, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4 border-t border-hairline pt-8">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="gameId" value={gameId ?? ""} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="next" value={next ?? ""} />

      <p className="m-0 text-sm opacity-70">{t.auth.otpLead}</p>

      <label className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
          {t.auth.otpLabel}
        </span>
        {/*
          `inputMode="numeric"` and `autoComplete="one-time-code"` between them
          get a numeric keypad on a phone and let iOS offer the code straight
          from the notification — which is the whole point of this path being
          faster than the link it exists to replace.
        */}
        <input
          type="text"
          name="token"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 -]*"
          maxLength={8}
          data-testid="otp-input"
          placeholder={t.auth.otpPlaceholder}
          className="rounded-control border border-hairline-link bg-transparent px-4 py-3 text-center font-mono text-xl tracking-[8px] outline-none transition-colors focus:border-volt"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        data-testid="otp-submit"
        className="rounded-cta border border-hairline-volt px-4 py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-volt transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.auth.otpSubmit}
      </button>

      {state.status === "error" && state.message ? (
        <p role="status" data-testid="otp-error" className="text-sm text-red-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
