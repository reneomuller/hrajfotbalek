"use client";

import { useActionState, useState } from "react";
import { setContactAction, type SiteSettingState } from "@/app/admin/site/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";

const INITIAL: SiteSettingState = { status: "idle" };

/**
 * The contact details the footer's dialog shows.
 *
 * ONE TEXTAREA PER LIST, one entry per line. Not a repeating field set with
 * add and remove buttons: this is edited twice a year, the values are one line
 * each, and a textarea needs no explanation and no JavaScript to add a row.
 *
 * BOTH ARE SAVED TOGETHER, by one button. They are one thought — "how people
 * reach us" — and two buttons would let the page sit in a state where the
 * emails are saved and the phones are not, with nothing on screen saying so.
 *
 * CONTROLLED (round 42). They were `defaultValue` fields, and React resets an
 * uncontrolled `<form action={…}>` once the action returns — a REFUSED save
 * included — so an address the RPC turned down put the old lists back and the
 * admin's edit was gone with the error still showing.
 * `lib/admin/shell/__tests__/siteForms.test.ts` holds the line.
 *
 * ENGLISH, like the rest of the panel (R22).
 */
export function ContactForm({
  emails,
  phones,
}: {
  emails: string[];
  phones: string[];
}) {
  const [state, formAction] = useActionState(setContactAction, INITIAL);
  const [emailsText, setEmailsText] = useState(emails.join("\n"));
  const [phonesText, setPhonesText] = useState(phones.join("\n"));

  return (
    <form action={formAction} data-testid="contact-form" className="flex flex-col gap-4">
      <div>
        <label className="field-label" htmlFor="contactEmails">
          {strings.admin.siteContactEmailsLabel}
        </label>
        <textarea
          id="contactEmails"
          name="contactEmails"
          rows={3}
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
          data-testid="contact-emails-input"
          className="field mt-2 w-full resize-y"
        />
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {strings.admin.siteContactEmailsHint}
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor="contactPhones">
          {strings.admin.siteContactPhonesLabel}
        </label>
        <textarea
          id="contactPhones"
          name="contactPhones"
          rows={3}
          value={phonesText}
          onChange={(event) => setPhonesText(event.target.value)}
          data-testid="contact-phones-input"
          className="field mt-2 w-full resize-y"
        />
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {strings.admin.siteContactPhonesHint}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PendingButton label={strings.admin.siteContactSave} testId="contact-save" />
        {state.status === "saved" && (
          <p data-testid="contact-saved" className="m-0 text-small text-volt">
            {strings.admin.siteContactSaved}
          </p>
        )}
        {state.status === "error" && state.message && (
          <p role="alert" data-testid="contact-error" className="m-0 text-small text-warn">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
