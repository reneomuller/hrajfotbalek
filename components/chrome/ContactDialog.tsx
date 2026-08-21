"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStrings } from "@/components/LocaleProvider";

/**
 * The footer's Contact control, and what it opens.
 *
 * IT USED TO BE A `mailto:` TO A HARDCODED ADDRESS. On a phone that opens a
 * mail client over the site with a blank message, which is a lot to ask of
 * somebody who wanted to know whether there is a phone number. Now it shows
 * what there is and lets them choose.
 *
 * PORTALLED INTO `document.body`, and that is the codebase's standing law
 * rather than a preference. `z-50` is a rank WITHIN a stacking context, and
 * most page shells here are `<main className="relative z-10">` — which caps
 * everything inside them below the nav pill at `fixed z-40`. A dialog rendered
 * in place looks correct in a screenshot and is unreachable:
 * `elementFromPoint` at its centre returns a nav-pill list item. See
 * `CancelBookingForm`, which is the worked example.
 *
 * THE VALUES COME FROM `site_settings` (round 13, item 18), read on the server
 * and passed down, so the owner edits them in `/admin` and no deploy is
 * involved. An EMPTY PHONE LIST IS A REAL STATE and renders no phone section
 * at all.
 */
export function ContactDialog({
  emails,
  phones,
}: {
  emails: string[];
  phones: string[];
}) {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes it, and focus lands somewhere sensible on open. `<dialog>`
  // would give both for free, but it also gives a top-layer that ignores the
  // portal — and the portal is what the z-index law is about.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="contact-open"
        className="min-h-11 text-small text-muted no-underline transition-colors hover:text-bone"
      >
        {t.siteFooter.contact}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-testid="contact-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t.siteFooter.contactTitle}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/80 p-4 sm:items-center"
            onClick={(event) => {
              // The backdrop closes it; a click inside must not.
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div className="lifted w-full max-w-[420px] rounded-card p-5">
              <h2 className="m-0 font-display text-title uppercase tracking-wide text-white">
                {t.siteFooter.contactTitle}
              </h2>

              <ul className="mt-4 list-none space-y-2 p-0" data-testid="contact-emails">
                {emails.map((email) => (
                  <li key={email}>
                    <a
                      href={`mailto:${email}`}
                      className="text-body-lg font-semibold text-volt no-underline"
                    >
                      {email}
                    </a>
                  </li>
                ))}
              </ul>

              {/*
                NO PHONE SECTION WHEN THERE IS NO PHONE. Not an empty heading
                and not "none listed" — the owner may simply not publish a
                number, and a label over nothing reads as a fault.
              */}
              {phones.length > 0 && (
                <ul className="mt-3 list-none space-y-2 p-0" data-testid="contact-phones">
                  {phones.map((phone) => (
                    <li key={phone}>
                      <a
                        href={`tel:${phone.replace(/\s/g, "")}`}
                        className="text-body-lg font-semibold text-volt no-underline"
                      >
                        {phone}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                data-testid="contact-close"
                className="mt-5 inline-flex min-h-11 items-center rounded-pill border-2 border-hairline-strong px-5 text-small font-bold uppercase tracking-wide text-bone transition-colors hover:border-volt hover:text-volt"
              >
                {t.common.close}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
