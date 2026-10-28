"use client";

import { useActionState } from "react";
import Link from "next/link";
import { startSignup, finishSignup, type SignupFormState } from "./actions";
import { NICKNAME_MAX_LENGTH } from "@/lib/auth/nickname";
import {
  PASSWORD_MIN_LENGTH,
  PHONE_MAX_LENGTH,
  PHONE_MIN_LENGTH,
  SKILL_LEVELS,
} from "@/lib/auth/signupProfile";
import type { CountryOption } from "@/lib/auth/countries";
import { useStrings } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";
import { LinkedText } from "@/components/form/LinkedText";
import { PhoneField, type PhoneCountryChoice } from "@/components/form/PhoneField";

const initialState: SignupFormState = { status: "idle" };

/* The shared control treatment — see the note in globals.css. */
const FIELD_CLASS = "field";
const LABEL_CLASS = "field-label";

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
  phoneCountries,
  defaultPhoneCountry,
  defaultEmailLocale,
  mode = "create",
}: {
  next: string;
  countries: CountryOption[];
  /** Round 41 — the phone prefix's choices, each with its calling code. */
  phoneCountries: PhoneCountryChoice[];
  defaultPhoneCountry: string;
  /** Round 41 — the language the site is showing: the browser's, unless chosen. */
  defaultEmailLocale: Locale;
  mode?: "create" | "finish";
}) {
  const t = useStrings();
  const creating = mode === "create";
  const [state, formAction, pending] = useActionState(
    creating ? startSignup : finishSignup,
    initialState,
  );

  /*
    WHAT THE PLAYER ALREADY TYPED, on every error path.

    `defaultValue` rather than `value`: these stay uncontrolled, so the
    browser owns the field between renders and a password manager, an
    autofill or an IME composition is not fought with. The key on the form
    is what makes a rejected submission actually repaint them — without it
    React reuses the existing DOM nodes and the defaults are ignored.
  */
  const v = state.values;

  /*
    WHY THE NON-TEXT CONTROLS ARE KEYED.

    React RESETS uncontrolled form fields once a form action completes. For a
    text input that is harmless here — reset restores the `defaultValue`
    attribute, which now holds what the player typed. For a `<select>` and for
    radios and checkboxes it is not: `defaultValue` / `defaultChecked` are
    applied at MOUNT ONLY, so the reset restored the mount-time default and
    the country dropped back to "Choose your country" while the text fields
    looked fine. That asymmetry is exactly why this bug reads as random.

    Keying them on the returned values remounts precisely those controls when
    a submission comes back, and only then — the key is stable across
    re-renders that carry the same values, so typing does not remount
    anything mid-edit.
  */
  const valuesKey = JSON.stringify(v ?? null);

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
    /* p09's card: one lifted box holding the whole field stack. */
    <form action={formAction} className="lifted mt-6 flex flex-col gap-5 rounded-card p-5">
      <input type="hidden" name="next" value={next} />

      {creating ? (
        <>
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>{t.auth.emailLabel}</span>
            <input
              type="email"
              name="email"
              defaultValue={v?.email ?? ""}
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
          defaultValue={v?.nickname ?? ""}
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
        <select
          key={`country-${valuesKey}`}
          name="country"
          required
          defaultValue={v?.country ?? ""}
          className={FIELD_CLASS}
        >
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
              /* p09 draws the three levels as capsules, not rounded squares. */
            className="flex cursor-pointer items-center gap-2 rounded-pill border border-hairline-strong px-3 py-2 text-sm has-[:checked]:border-volt has-[:checked]:text-volt"
            >
              <input
                key={`skill-${level}-${valuesKey}`}
                type="radio"
                name="skill"
                value={level}
                required
                defaultChecked={v?.skill === level}
                className="accent-volt"
              />
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

      <div className="flex flex-col gap-2">
        {/*
          A DIV, NOT A LABEL, since round 41: a <label> wrapping two controls
          names the FIRST one, which is now the country code. The number gets
          its label by id; the select carries its own aria-label.
        */}
        <label htmlFor="signup-phone" className={LABEL_CLASS}>
          {t.auth.phoneLabel}
        </label>
        {/*
          `required` AND `minLength` MIRROR THE SERVER (round 7, item 7). The
          browser check is a courtesy that saves a round trip; the rule that
          counts is in `parseSignupForm`, which is what a curl request meets.
          Both are stated so the two cannot silently disagree.
        */}
        <PhoneField
          key={`phone-${valuesKey}`}
          options={phoneCountries}
          defaultCountry={v?.phoneCountry || defaultPhoneCountry}
          defaultNumber={v?.phone ?? ""}
          countryLabel={t.auth.phoneCountryLabel}
          inputId="signup-phone"
          required
          minLength={PHONE_MIN_LENGTH}
          maxLength={PHONE_MAX_LENGTH}
          inputClassName={FIELD_CLASS}
        />
        <span className="text-xs opacity-50">{t.auth.phoneHint}</span>
        <FieldError show={state.field === "phone"} message={state.message} />
      </div>

      {/*
        THE LEGAL ACT, APART FROM THE PREFERENCE (round 40, the lawyer's Texty
        2.2). ~~Two boxes, terms and privacy.~~ One required box carries the
        terms, the community rules, the "we do not organise the games" notice
        and the photo permission; the privacy policy is a LINK beneath it,
        because processing rests on the contract and not on a consent. The
        grouping still matters: a preference that looks like a legal act gets
        ticked unread.
      */}
      <fieldset className="flex flex-col gap-3 rounded-card border border-hairline-strong p-4">
        <legend className={`px-2 ${LABEL_CLASS}`}>{t.auth.legalGroupLabel}</legend>

        <label className="flex items-start gap-3 text-sm">
          <input
            key={`tos-${valuesKey}`}
            type="checkbox"
            name="tos"
            defaultChecked={v?.tos ?? false}
            className="mt-1 accent-volt"
          />
          <span data-testid="tos-agreement">
            <LinkedText
              template={t.auth.tosAgreement}
              links={{
                terms: { href: "/terms", label: t.auth.tosTermsLink },
                rules: { href: "/terms#pravidla", label: t.auth.tosRulesLink },
              }}
            />
          </span>
        </label>
        <FieldError show={state.field === "tos"} message={state.message} />

        <Link
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="privacy-how"
          className="ml-7 text-sm underline opacity-70"
        >
          {t.auth.privacyHowLink}
        </Link>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>{t.auth.preferencesGroupLabel}</span>
        <label className="flex items-start gap-3 text-sm">
          <input
            key={`marketing-${valuesKey}`}
            type="checkbox"
            name="marketing"
            defaultChecked={v?.marketing ?? false}
            className="mt-1 accent-volt"
          />
          <span>{t.auth.marketingLabel}</span>
        </label>

        {/*
          THE LANGUAGE EMAILS ARE WRITTEN IN (round 41). Pre-set to the
          language this page is in — the browser's, unless the switcher said
          otherwise — so most people never touch it; each option is named in
          its own language, like the switcher's.
        */}
        <label className="mt-2 flex flex-col gap-2">
          <span className={LABEL_CLASS}>{t.auth.emailLocaleLabel}</span>
          <select
            key={`email-locale-${valuesKey}`}
            name="email_locale"
            data-testid="signup-email-locale"
            defaultValue={v?.emailLocale || defaultEmailLocale}
            className={FIELD_CLASS}
          >
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABELS[locale].full}
              </option>
            ))}
          </select>
          <span className="text-xs opacity-50">{t.auth.emailLocaleHint}</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        data-testid="signup-submit"
        /* `rounded-pill`, as p09 draws it. */
        className="rounded-pill bg-volt px-4 py-[15px] text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
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
