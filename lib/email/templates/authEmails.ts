import { resolveStrings } from "@/lib/i18n/resolve";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { renderEmail, type RenderedEmail } from "./layout";
import { fill } from "./parts";

/**
 * THE THREE EMAILS SUPABASE SENDS, IN THE APPROVED DESIGN (round 41).
 *
 * Sign-in (magic link + code), confirm signup, and change of email are
 * rendered by Supabase from templates in its dashboard, so they cannot be sent
 * from here. They are BUILT here — from the same layout and the same string
 * table as every other email — and `scripts/email/build-auth-templates.ts`
 * writes the HTML for the owner to paste (see AUTH_EMAIL_TEMPLATE.md).
 *
 * ONE TEMPLATE, FOUR LANGUAGES. Supabase's Go templates can read the account's
 * own metadata as `.Data`, so the language is chosen the way the app chooses
 * it (`lib/email/recipientLocale.ts`): the email language, else the language
 * the terms were read in at signup, else English. Comparing a MISSING key with
 * `eq` is an error in Go templates, hence the `if` guards around each read.
 *
 * Supabase's placeholders pass straight through `renderEmail`: `{{ .Token }}`
 * contains nothing the escaper touches, and `&type=` becomes `&amp;type=`
 * inside an attribute, which a mail client reads back as `&`.
 */
export const AUTH_TEMPLATES = ["magic_link", "confirm_signup", "email_change"] as const;
export type AuthTemplate = (typeof AUTH_TEMPLATES)[number];

const CALLBACK = "{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=";

function render(kind: AuthTemplate, locale: Locale): RenderedEmail {
  const t = resolveStrings(locale);
  const a = t.emails.auth;
  const base = {
    locale,
    baseUrl: "{{ .SiteURL }}",
    footer: a.footer,
    smallPrint: [a.expiry, a.notYou],
  };

  switch (kind) {
    case "magic_link":
      return renderEmail({
        ...base,
        subject: a.signInSubject,
        preheader: a.signInLede,
        eyebrow: a.signInEyebrow,
        headline: a.signInHeadline,
        lede: a.signInLede,
        cta: { href: `${CALLBACK}email`, label: a.signInCta },
        code: { label: a.code, value: "{{ .Token }}" },
      });
    case "confirm_signup":
      return renderEmail({
        ...base,
        subject: a.confirmSubject,
        preheader: a.confirmLede,
        eyebrow: a.confirmEyebrow,
        headline: a.confirmHeadline,
        lede: a.confirmLede,
        cta: { href: `${CALLBACK}signup`, label: a.confirmCta },
        code: { label: a.code, value: "{{ .Token }}" },
      });
    case "email_change": {
      const lede = fill(a.changeLede, { email: "{{ .Email }}", newEmail: "{{ .NewEmail }}" });
      return renderEmail({
        ...base,
        subject: a.changeSubject,
        preheader: lede,
        eyebrow: a.changeEyebrow,
        headline: a.changeHeadline,
        lede,
        cta: { href: `${CALLBACK}email_change`, label: a.changeCta },
        smallPrint: [a.notYou],
      });
    }
  }
}

/** The subject line in each language, for the dashboard's Subject field. */
export function supabaseSubject(kind: AuthTemplate): string {
  // One line: a subject field takes no line breaks.
  return languageSwitch((locale) => render(kind, locale).subject, "");
}

/** The message body — the HTML the owner pastes into the dashboard. */
export function supabaseTemplate(kind: AuthTemplate): string {
  return languageSwitch((locale) => render(kind, locale).html);
}

function languageSwitch(body: (locale: Locale) => string, separator = "\n"): string {
  const others = LOCALES.filter((locale) => locale !== "en");
  return [
    '{{ $l := "en" }}',
    "{{ if .Data.consent_locale }}{{ $l = .Data.consent_locale }}{{ end }}",
    "{{ if .Data.email_locale }}{{ $l = .Data.email_locale }}{{ end }}",
    ...others.map((locale, i) => `{{ ${i === 0 ? "if" : "else if"} eq $l "${locale}" }}${body(locale)}`),
    `{{ else }}${body("en")}{{ end }}`,
  ].join(separator);
}
