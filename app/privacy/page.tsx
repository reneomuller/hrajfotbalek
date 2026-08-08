import Link from "next/link";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.privacy.title };

/**
 * `/privacy` — the DRAFT placeholder.
 *
 * This file is created in Phase 27 and nowhere else: Phases 8 and 14 link here
 * from the signup consent line and the account deletion context, and those
 * links were dead until now. One owner, one file.
 *
 * THE COPY IS HUMAN-OWNED AND STILL MISSING. What renders below is a marked
 * placeholder — a DRAFT banner, an outline of what the real policy has to
 * cover, and a live contact address for anyone who wants their data removed
 * before the real text lands. Nothing here is written to pass as a policy,
 * because a plausible-looking generated policy is the failure mode: it gets
 * shipped. Phase 30 replaces this page wholesale with Oliver's text.
 *
 * The page is intentionally NOT translated. The real policy is a legal
 * document per language, supplied by a human, not a UI string table.
 */
export default function PrivacyPage() {
  const { privacy, account } = strings;
  // The data-protection address, not the general one: the same mailbox the
  // account page's deletion-request copy uses, so a request raised from either
  // surface arrives in the same place.
  const contactEmail = account.deleteMailto;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {privacy.title}
      </h1>

      {/* Loud on purpose. This banner is the whole point of the page shipping early. */}
      <div className="mt-6 rounded-card border border-hairline-volt bg-surface p-5">
        <p className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-volt">
          {privacy.draftBadge}
        </p>
        <p className="mt-3 mb-0 text-sm leading-relaxed text-bone">
          {privacy.draftWarning}
        </p>
      </div>

      <section className="mt-10 rounded-card border border-dashed border-hairline-strong p-5">
        <p className="m-0 text-center font-mono text-[11px] tracking-eyebrow text-volt-dim">
          {privacy.insertionPoint}
        </p>
        <p className="mt-4 mb-0 text-sm leading-relaxed text-muted">
          {privacy.insertionHint}
        </p>

        <ul className="mt-5 mb-0 flex list-none flex-col gap-2 p-0">
          {privacy.outline.map((item) => (
            <li
              key={item}
              className="border-l-2 border-hairline-volt pl-3 text-sm leading-relaxed text-muted"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-sm text-muted">
        {privacy.contactLead}{" "}
        <a
          href={`mailto:${contactEmail}`}
          className="text-volt no-underline hover:underline"
        >
          {contactEmail}
        </a>
      </p>

      <Link
        href="/games"
        className="mt-8 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
      >
        {privacy.back}
      </Link>
    </main>
  );
}
