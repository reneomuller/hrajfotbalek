"use client";

import type { Ref } from "react";
import { LinkedText } from "@/components/form/LinkedText";
import { useStrings } from "@/components/LocaleProvider";
import { TERMS_FIELD } from "@/lib/legal/terms";

/**
 * "I accept the terms of service" at the point of purchase (round 38).
 *
 * THE SAME KEYS AS SIGNUP (`auth.tosLabel`, `auth.tosLink`), not a second
 * wording: one concept, one name — CLAUDE.md's rule for keeping two surfaces
 * from drifting apart.
 *
 * THE LINK OPENS IN A NEW TAB, unlike signup's. Here it sits inside a
 * half-made purchase — a chosen party, a chosen payment method — and
 * navigating away to read the terms would throw that away.
 *
 * Uncontrolled with `required` on the booking form, where the box lives
 * inside the form it guards; controlled on `/pass`, where one box serves five
 * separate tier forms (see `PassTerms`). The server actions enforce it either
 * way — `lib/legal/terms.ts`.
 */
export function TermsCheckbox({
  checked,
  onChange,
  required,
  error,
  inputRef,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  required?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const t = useStrings();

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 items-start gap-3 text-sm text-bone">
        <input
          ref={inputRef}
          type="checkbox"
          name={TERMS_FIELD}
          required={required}
          checked={checked}
          onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
          aria-invalid={error ? true : undefined}
          data-testid="terms-accept"
          className="mt-1 accent-volt"
        />
        <span>
          <LinkedText
            template={t.booking.termsAgree}
            links={{ terms: { href: "/terms", label: t.auth.tosTermsLink } }}
          />
        </span>
      </label>
      {error && (
        <p role="alert" data-testid="terms-error" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
