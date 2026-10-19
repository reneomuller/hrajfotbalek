import type { Metadata } from "next";
import Link from "next/link";
import { getContactDetails } from "@/lib/home/queries";
import { getStrings } from "@/lib/i18n/server";
import { OPERATOR_CONTACT } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.siteFooter.contact };
}

const LINK = "text-volt underline-offset-4 hover:underline";

/**
 * `/contact` — Kontakt (the lawyer's brief, item 1.1).
 *
 * WHO RUNS THIS AND HOW TO REACH THEM: the operator, its address, the
 * personal-data address, the out-of-court body for consumer disputes, and the
 * single point of contact the Digital Services Act requires. No phone number
 * yet — the owner has none to publish.
 *
 * THE ADMIN'S CONTACT LIST STILL HAS A HOME. Round 13 let the owner edit the
 * footer's contact details in `/admin` without a deploy; that dialog is gone
 * from the footer, so whatever he adds there is listed here under "other ways
 * to reach us" — minus anything the operator block already says, so no
 * address appears twice.
 */
export default async function ContactPage() {
  const t = await getStrings();
  const { legal } = t;
  const contact = await getContactDetails(OPERATOR_CONTACT.email);

  const shown = new Set<string>([OPERATOR_CONTACT.email, OPERATOR_CONTACT.privacyEmail]);
  const otherEmails = contact.emails.filter((email) => !shown.has(email.toLowerCase()));
  const hasOthers = otherEmails.length > 0 || contact.phones.length > 0;

  const rows = [
    { key: "operator", label: legal.operatorLabel, value: OPERATOR_CONTACT.name },
    {
      key: "email",
      label: legal.emailLabel,
      value: (
        <a href={`mailto:${OPERATOR_CONTACT.email}`} className={LINK}>
          {OPERATOR_CONTACT.email}
        </a>
      ),
    },
    {
      key: "privacy",
      label: legal.privacyEmailLabel,
      value: (
        <a href={`mailto:${OPERATOR_CONTACT.privacyEmail}`} className={LINK}>
          {OPERATOR_CONTACT.privacyEmail}
        </a>
      ),
    },
    {
      key: "adr",
      label: legal.adrLabel,
      value: (
        <a href={OPERATOR_CONTACT.adrUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
          {legal.adrName}
        </a>
      ),
    },
    {
      key: "dsa",
      label: legal.dsaLabel,
      value: (
        <>
          <a href={`mailto:${OPERATOR_CONTACT.email}`} className={LINK}>
            {OPERATOR_CONTACT.email}
          </a>{" "}
          ({legal.dsaLanguages})
        </>
      ),
    },
  ];

  return (
    <main className="relative z-10 mx-auto w-full max-w-content px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-title uppercase text-bone">{t.siteFooter.contact}</h1>

      <dl data-testid="contact-operator" className="m-0 mt-8 flex flex-col gap-5">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1">
            <dt className="text-eyebrow uppercase text-faint">{row.label}</dt>
            <dd className="m-0 text-body text-bone">{row.value}</dd>
          </div>
        ))}
      </dl>

      {hasOthers ? (
        <section className="mt-10 border-t border-hairline pt-6">
          <h2 className="m-0 text-body-lg font-semibold text-bone">{legal.otherContactsLabel}</h2>
          {otherEmails.length > 0 ? (
            <ul data-testid="contact-emails" className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {otherEmails.map((email) => (
                <li key={email}>
                  <a href={`mailto:${email}`} className={LINK}>
                    {email}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {contact.phones.length > 0 ? (
            <ul data-testid="contact-phones" className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {contact.phones.map((phone) => (
                <li key={phone} className="text-body text-bone">
                  <span className="text-faint">{legal.phoneLabel}: </span>
                  <a href={`tel:${phone.replace(/\s+/g, "")}`} className={LINK}>
                    {phone}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <Link
        href="/games"
        className="mt-10 inline-flex min-h-11 items-center text-small text-faint no-underline hover:text-volt-dim"
      >
        {legal.back}
      </Link>
    </main>
  );
}
