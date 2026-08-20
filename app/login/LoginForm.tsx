"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInWithPassword, type LoginFormState } from "./actions";
import { useStrings } from "@/components/LocaleProvider";

const initialState: LoginFormState = { status: "idle" };

/*
 * `field` and `field-label` are the shared control treatment in globals.css —
 * see the note there. They were two local constants duplicated byte-for-byte
 * in the signup form, which is how the two auth screens stayed in step.
 *
 * `panel` is p08's card: the frames put the field stack inside a lifted box
 * rather than loose on the page, and repeat the shape for the create-account
 * block underneath it.
 */
const FIELD_CLASS = "field";
const LABEL_CLASS = "field-label";
const PANEL_CLASS = "lifted rounded-card p-5";

/**
 * Sign in.
 *
 * PASSWORD FIRST, CODE UNDERNEATH. From Phase 2 the password is the way in and
 * the emailed code is what you use when you have no password yet or have
 * forgotten it (contract §3.2). The code path below is the Phase 1 flow
 * unchanged — same action, same email, same `verifyOtp` — because it is also
 * the rollback if password sign-in ever fails. Rewriting it while making it the
 * fallback would have removed the thing it is there to fall back to.
 */
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
  const [state, formAction, pending] = useActionState(signInWithPassword, initialState);

  return (
    <>
      <form action={formAction} className={`mt-6 flex flex-col gap-4 ${PANEL_CLASS}`}>
        {/* Carried through so the booking intent survives the sign-in. */}
        <input type="hidden" name="gameId" value={gameId ?? ""} />
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="next" value={next ?? ""} />

        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>{t.auth.emailLabel}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            data-testid="login-email"
            placeholder={t.auth.emailPlaceholder}
            className={FIELD_CLASS}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>{t.auth.passwordLabel}</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            data-testid="login-password"
            className={FIELD_CLASS}
          />
        </label>

        {/*
          A real submit button, so Enter inside the field and a tap both work.
          It was once painted with `bg-[var(--color-volt)]` — a variable nothing
          defines — which rendered black text on a transparent block and made
          the only way forward invisible. Colour comes from the theme token.
        */}
        <button
          type="submit"
          disabled={pending}
          data-testid="login-submit"
          /* `rounded-pill` — p08 draws every primary control as a capsule. */
          className="rounded-pill bg-volt px-4 py-[15px] text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
        >
          {pending ? t.common.loading : t.auth.signInSubmit}
        </button>

        {state.status === "error" && state.message ? (
          <p role="status" data-testid="login-error" className="text-sm text-red-400">
            {state.message}
          </p>
        ) : null}
      </form>

      {/*
        A SMALL LINK, NOT A SECOND CARD (round 9, item 8).

        Recovery used to be a whole panel under the sign-in one: its own email
        field, its own submit, permanently open. That gave a path most people
        never take the same weight as the one they came for, and it put two
        email boxes on one screen — which is its own small confusion.

        It is a quiet text link now, under the button that failed, which is
        exactly where somebody looks the moment a password does not work. The
        two-step behind it is unchanged and moved wholesale to `/login/reset`.
      */}
      <p className="mt-4 text-center">
        <Link
          href={resetHref({ gameId, action, next })}
          data-testid="forgot-password-link"
          className="text-small font-semibold text-volt no-underline transition-colors hover:text-bone"
        >
          {t.auth.forgotPasswordLink}
        </Link>
      </p>
    </>
  );
}

/** Carries the booking intent across the login -> reset hop, as signup does. */
function resetHref({
  gameId,
  action,
  next,
}: {
  gameId: string | null;
  action: string;
  next: string | null;
}): string {
  const query = new URLSearchParams();
  if (gameId) query.set("game", gameId);
  if (action) query.set("action", action);
  if (next) query.set("next", next);
  const suffix = query.toString();
  return suffix ? `/login/reset?${suffix}` : "/login/reset";
}

