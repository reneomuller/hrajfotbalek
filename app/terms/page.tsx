import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { loadLegalDocument } from "@/lib/content/legalDocuments";
import { TERMS_VERSION } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.terms.title };
}

/**
 * `/terms` — the terms of service, version 1.0.
 *
 * REAL TEXT, unlike `/privacy`, which is still a marked placeholder because no
 * privacy policy has been delivered. The two are separate documents and only
 * one of them exists.
 *
 * The document is a file per language under `content/`, not a string table:
 * `lib/strings.ts` falls back to English key by key, which is right for a
 * button and wrong for a contract — half a clause in the wrong language is
 * worse than a whole document in a language the reader can identify. Russian
 * has no authored text, so a Russian reader gets English with a notice saying
 * so, rather than a machine translation of a contract.
 *
 * Rendered from parsed blocks rather than injected HTML. There is no
 * `dangerouslySetInnerHTML` here and no sanitiser to get wrong.
 */
export default async function TermsPage() {
  const t = await getStrings();
  const locale = await getLocale();
  const doc = loadLegalDocument("terms", locale);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      {!doc.isTranslated ? (
        <p
          className="mb-6 rounded-card border border-hairline-volt bg-surface p-4 text-sm text-white/80"
          role="note"
        >
          {t.terms.notTranslated}
        </p>
      ) : null}

      <article className="flex flex-col gap-5">
        {doc.blocks.map((block, index) => {
          const spans = block.spans.map((span, i) =>
            span.bold ? (
              <strong key={i} className="font-semibold text-white">
                {span.text}
              </strong>
            ) : (
              <span key={i}>{span.text}</span>
            ),
          );

          if (block.type === "heading") {
            return (
              <h1
                key={index}
                className="m-0 font-display text-section-title uppercase tracking-wide text-white"
              >
                {spans}
              </h1>
            );
          }

          return (
            <p key={index} className="m-0 text-sm leading-relaxed text-white/75">
              {spans}
            </p>
          );
        })}
      </article>

      <p className="mt-8 text-[11px] uppercase tracking-eyebrow text-volt">
        {t.terms.versionLabel} {TERMS_VERSION}
      </p>

      <Link
        href="/games"
        className="mt-8 inline-block text-sm text-white/60 underline underline-offset-4"
      >
        {t.terms.back}
      </Link>
    </main>
  );
}
