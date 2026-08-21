"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} data-testid="contact-form" className="mt-4">
      <label className="field-label" htmlFor="contactEmails">
        {strings.admin.siteContactEmailsLabel}
      </label>
      <textarea
        id="contactEmails"
        name="contactEmails"
        rows={3}
        defaultValue={emails.join("\n")}
        data-testid="contact-emails-input"
        className="field mt-1 w-full"
      />
      <p className="mt-1 text-[13px] text-muted">{strings.admin.siteContactEmailsHint}</p>

      <label className="field-label mt-4 block" htmlFor="contactPhones">
        {strings.admin.siteContactPhonesLabel}
      </label>
      <textarea
        id="contactPhones"
        name="contactPhones"
        rows={3}
        defaultValue={phones.join("\n")}
        data-testid="contact-phones-input"
        className="field mt-1 w-full"
      />
      <p className="mt-1 text-[13px] text-muted">{strings.admin.siteContactPhonesHint}</p>

      <div className="mt-4">
        <PendingButton label={strings.admin.siteContactSave} testId="contact-save" />
      </div>

      {state.status === "saved" && (
        <p data-testid="contact-saved" className="mt-3 text-[13px] text-volt">
          {strings.admin.siteContactSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="contact-error" className="mt-3 text-[13px] text-bone">
          {state.message}
        </p>
      )}
    </form>
  );
}
