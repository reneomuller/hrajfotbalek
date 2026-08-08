"use client";

import { useActionState } from "react";
import {
  changeEmailAction,
  changePasswordAction,
  type SecurityActionState,
} from "@/app/account/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/signupProfile";
import { useStrings } from "@/components/LocaleProvider";

const initialState: SecurityActionState = { status: "idle" };

const FIELD_CLASS =
  "rounded-control border border-hairline-strong bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-volt";
const LABEL_CLASS =
  "font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60";

function Result({ state }: { state: SecurityActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.status === "error" ? "text-red-400" : "text-volt"}`}
    >
      {state.message}
    </p>
  );
}

/**
 * Change password.
 *
 * The current password is required by the action, not merely by this form —
 * `updateUser` needs only a session, so without that check an unattended phone
 * is a permanent account takeover.
 */
export function ChangePasswordForm() {
  const t = useStrings();
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="m-0 font-condensed text-base font-bold uppercase tracking-wide text-white">
        {t.account.changePasswordTitle}
      </h3>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.account.currentPasswordLabel}</span>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          data-testid="current-password"
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.account.newPasswordLabel}</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          data-testid="new-password"
          className={FIELD_CLASS}
        />
        <span className="text-xs opacity-50">{t.auth.passwordHint}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        data-testid="change-password"
        className="rounded-control border border-hairline-volt px-4 py-3 font-condensed text-cta font-extrabold uppercase tracking-wide text-volt transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.account.changePasswordSubmit}
      </button>

      <Result state={state} />
    </form>
  );
}

/**
 * Change email — two confirmations, stated before the button.
 *
 * The hint is not decoration. Nothing visible happens on this page when the
 * form is submitted: the change lives in two inboxes until both are opened.
 * Someone expecting one email who receives two assumes something broke;
 * someone expecting two knows the change is not finished yet.
 */
export function ChangeEmailForm({ currentEmail = null }: { currentEmail?: string | null }) {
  const t = useStrings();
  const [state, formAction, pending] = useActionState(changeEmailAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="m-0 font-condensed text-base font-bold uppercase tracking-wide text-white">
        {t.account.changeEmailTitle}
      </h3>

      {currentEmail ? (
        <p className="m-0 font-mono text-xs text-white/50">{currentEmail}</p>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.account.newEmailLabel}</span>
        <input
          type="email"
          name="newEmail"
          required
          autoComplete="email"
          inputMode="email"
          data-testid="new-email"
          className={FIELD_CLASS}
        />
      </label>

      <p className="m-0 text-xs opacity-60">{t.account.changeEmailHint}</p>

      <button
        type="submit"
        disabled={pending}
        data-testid="change-email"
        className="rounded-control border border-hairline-volt px-4 py-3 font-condensed text-cta font-extrabold uppercase tracking-wide text-volt transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.account.changeEmailSubmit}
      </button>

      <Result state={state} />
    </form>
  );
}
