"use client";

import { useActionState } from "react";
import { setEmailLocaleAction, type EmailLocaleActionState } from "@/app/account/actions";
import { useStrings } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

const INITIAL: EmailLocaleActionState = { status: "idle" };

/**
 * The language a player's emails are written in (round 41), under the
 * newsletter switch it sits with on the account page.
 *
 * SAVES ON CHANGE. A one-field form with a Save button is a button that only
 * exists to be forgotten; the select submits its form the moment it changes,
 * and "Saved" says it took.
 */
export function EmailLanguagePreference({ current }: { current: Locale }) {
  const t = useStrings();
  const [state, formAction, pending] = useActionState(setEmailLocaleAction, INITIAL);

  return (
    <section data-testid="email-language-preference" className="lifted rounded-card p-5">
      <form action={formAction} className="flex flex-col gap-2">
        <label htmlFor="email-locale" className="text-body text-bone">
          {t.auth.emailLocaleLabel}
        </label>
        <select
          id="email-locale"
          name="email_locale"
          data-testid="email-locale-select"
          defaultValue={current}
          disabled={pending}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field"
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_LABELS[locale].full}
            </option>
          ))}
        </select>
        <span className="text-small text-muted">{t.auth.emailLocaleHint}</span>
      </form>

      {state.status === "saved" && (
        <p role="status" data-testid="email-locale-saved" className="mt-3 mb-0 text-small text-volt">
          {t.profile.emailLocaleSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="mt-3 mb-0 text-small text-danger">
          {state.message}
        </p>
      )}
    </section>
  );
}
