"use client";

import { useActionState } from "react";
import Link from "next/link";
import { startSignup, finishSignup, type SignupFormState } from "./actions";
import { NICKNAME_MAX_LENGTH } from "@/lib/auth/nickname";
import { PASSWORD_MIN_LENGTH, SKILL_LEVELS } from "@/lib/auth/signupProfile";
import type { CountryOption } from "@/lib/auth/countries";
import { useStrings } from "@/components/LocaleProvider";

const initialState: SignupFormState = { status: "idle" };

const FIELD_CLASS =
  "rounded-control border border-hairline-strong bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-volt";
const LABEL_CLASS =
  "font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60";

function FieldError({ show, message }: { show: boolean; message?: string }) {
  if (!show || !message) return null;
  return (
    <span role="alert" className="text-sm text-red-400">
      {message}
    </span>
  );
}

/**
 * Signup.
 *
 * TWO MODES, ONE FORM. `mode="create"` is the signed-out account form: email,
 * password and profile. `mode="finish"` is the profile-only pass for a session
 * that has a verified account and no player row — someone whose nickname was
 * taken while their verification mail sat unread, or whose session predates
 * this flow. The fields that differ are the credential fields, so they are the
 * only thing branched on; duplicating the whole form would give the rare path
 * its own bugs.
 */
export function SignupForm({
  next,
  countries,
  mode = "create",
}: {
  next: string;
  countries: CountryOption[];
  mode?: "create" | "finish";
}) {
  const t = useStrings();
  const creating = mode === "create";
  const [state, formAction, pending] = useActionState(
    creating ? startSignup : finishSignup,
    initialState,
  );

  // The waiting room between `signUp()` and a verified email. Production
  // reaches this; the local stack, with confirmations off, never does.
  if (state.status === "verify") {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <h2 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
          {t.auth.verifyTitle}
        </h2>
        <p className="m-0 text-sm text-white/75">
          {t.auth.verifyBody.replace("{email}", state.email ?? "")}
        </p>
        <p className="m-0 text-xs text-white/50">{t.auth.verifyHint}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {creating ? (
        <>
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>{t.auth.emailLabel}</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={t.auth.emailPlaceholder}
              className={FIELD_CLASS}
            />
            <FieldError show={state.field === "email"} message={state.message} />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>{t.auth.passwordLabel}</span>
            <input
              type="password"
              name="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className={FIELD_CLASS}
            />
            <span className="text-xs opacity-50">{t.auth.passwordHint}</span>
            <FieldError show={state.field === "password"} message={state.message} />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.auth.nicknameLabel}</span>
        <input
          type="text"
          name="nickname"
          required
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          className={FIELD_CLASS}
        />
        <span className="text-xs opacity-50">{t.auth.nicknameHint}</span>
        <FieldError show={state.field === "nickname"} message={state.message} />
      </label>

      {/*
        A native <select> rather than a custom listbox, deliberately. Type-to-jump
        (contract §3.1) is behaviour every platform already implements here and
        nobody reimplements correctly: typing "cz" on a phone opens the native
        picker's own search, and on a desktop jumps the list. A bespoke combobox
        would have to rebuild keyboard handling, screen-reader semantics and the
        mobile sheet to arrive back where this starts.
      */}
      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.auth.countryLabel}</span>
        <select name="country" required defaultValue="" className={FIELD_CLASS}>
          <option value="" disabled>
            {t.auth.countryPlaceholder}
          </option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.name}
            </option>
          ))}
        </select>
        <FieldError show={state.field === "country"} message={state.message} />
      </label>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className={LABEL_CLASS}>{t.auth.skillLabel}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {SKILL_LEVELS.map((level) => (
            <label
              key={level}
              className="flex cursor-pointer items-center gap-2 rounded-control border border-hairline-strong px-3 py-2 text-sm has-[:checked]:border-volt has-[:checked]:text-volt"
            >
              <input type="radio" name="skill" value={level} required className="accent-volt" />
              {level === "beginner"
                ? t.auth.skillBeginner
                : level === "intermediate"
                  ? t.auth.skillIntermediate
                  : t.auth.skillAdvanced}
            </label>
          ))}
        </div>
        <span className="text-xs opacity-50">{t.auth.skillHint}</span>
        <FieldError show={state.field === "skill"} message={state.message} />
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.auth.phoneLabel}</span>
        <input type="tel" name="phone" autoComplete="tel" className={FIELD_CLASS} />
        <span className="text-xs opacity-50">{t.auth.phoneHint}</span>
      </label>

      {/*
        THE TWO LEGAL ACTS, TOGETHER AND APART FROM THE PREFERENCE.
        Contract §3.1 as corrected 2026-07-31: accepting the terms and
        consenting to data processing are separate acts with separate errors —
        one box covering both makes the consent non-specific, which is what
        makes it invalid. The grouping is part of the requirement, not styling:
        a preference that looks like a legal act gets ticked unread.
      */}
      <fieldset className="flex flex-col gap-3 rounded-card border border-hairline-strong p-4">
        <legend className={`px-2 ${LABEL_CLASS}`}>{t.auth.legalGroupLabel}</legend>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="tos" className="mt-1 accent-volt" />
          <span>
            {t.auth.tosLabel}{" "}
            <Link href="/terms" className="underline opacity-70">
              {t.auth.tosLink}
            </Link>
          </span>
        </label>
        <FieldError show={state.field === "tos"} message={state.message} />

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="gdpr" className="mt-1 accent-volt" />
          <span>
            {t.auth.gdprLabel}{" "}
            <Link href="/privacy" className="underline opacity-70">
              {t.auth.gdprLink}
            </Link>
          </span>
        </label>
        <FieldError show={state.field === "gdpr"} message={state.message} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.auth.preferencesGroupLabel}</span>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="marketing" className="mt-1 accent-volt" />
          <span>{t.auth.marketingLabel}</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-control bg-volt px-4 py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.auth.createAccount}
      </button>

      {state.status === "error" && !state.field && state.message ? (
        <p role="alert" className="text-sm text-red-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
