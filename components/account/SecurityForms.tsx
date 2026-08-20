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

/*
 * THE THIRD COPY OF THIS PAIR, now pointing at the shared treatment.
 *
 * Round 5 collapsed the login and signup forms onto `.field` / `.field-label`
 * in globals.css and missed this file, so the account's security forms kept
 * the JetBrains Mono label and the `bg-transparent` input that the rest of the
 * product had already left behind. Three copies is how "they will stay in
 * step" fails; two is the same failure with better odds.
 */
const FIELD_CLASS = "field";
const LABEL_CLASS = "field-label";

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
      <h3 className="m-0 text-base font-bold uppercase tracking-wide text-white">
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
        className="rounded-control border border-hairline-volt px-4 py-3 text-cta font-extrabold uppercase tracking-wide text-volt transition disabled:opacity-50"
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

  /*
   * NO HEADING AND NO ECHO OF THE CURRENT ADDRESS (round 7, item 2).
   *
   * This form is disclosed by a text link that sits directly under the email
   * address on the profile, so it opened with a heading repeating the link's
   * own words and a line repeating the address two rows above it. Together
   * with the bordered submit that made it read as a BOX appearing inside the
   * settings card — a panel inside a panel — where p11 has a small link and
   * the field it reveals.
   *
   * `currentEmail` is kept in the signature: the form is also reachable from
   * places where the address is not already on screen, and dropping the prop
   * would make that call site silently worse rather than fail to compile.
   */
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {currentEmail ? (
        <p className="m-0 text-small text-muted">{currentEmail}</p>
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
        className="self-start rounded-pill border-2 border-hairline-volt px-5 py-3 text-cta font-extrabold uppercase tracking-wide text-volt transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.account.changeEmailSubmit}
      </button>

      <Result state={state} />
    </form>
  );
}
