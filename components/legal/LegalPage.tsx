import Link from "next/link";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import {
  LEGAL_DOCUMENT_LOCALE,
  loadLegalDocument,
  type LegalDocumentName,
} from "@/lib/content/legalDocuments";
import { getLocale, getStrings } from "@/lib/i18n/server";

/**
 * The shell shared by `/terms`, `/privacy` and `/cookies`.
 *
 * The furniture is translated and the document is not: a non-Czech reader is
 * told, in their language and above the text, that the Czech version binds.
 * Czech readers get no notice — for them it would only say the obvious.
 */
export async function LegalPage({
  name,
  pdfHref,
  annexAnchor,
}: {
  name: LegalDocumentName;
  pdfHref?: string;
  annexAnchor?: string;
}) {
  const t = await getStrings();
  const locale = await getLocale();
  const document = loadLegalDocument(name);

  return (
    <main className="relative z-10 mx-auto w-full max-w-content px-gutter pb-16 pt-24">
      {locale !== LEGAL_DOCUMENT_LOCALE ? (
        <p
          role="note"
          data-testid="legal-czech-notice"
          className="m-0 mb-6 rounded-card bg-surface p-4 text-small text-white/80"
        >
          {t.legal.czechOnlyNotice}
        </p>
      ) : null}

      {pdfHref ? (
        <a
          href={pdfHref}
          download
          data-testid="legal-pdf"
          className="mb-6 inline-flex min-h-11 items-center text-small text-volt underline-offset-4 hover:underline"
        >
          {t.legal.downloadPdf}
        </a>
      ) : null}

      <LegalDocumentView document={document} annexAnchor={annexAnchor} />

      <Link
        href="/games"
        className="mt-10 inline-flex min-h-11 items-center text-small text-faint no-underline hover:text-volt-dim"
      >
        {t.legal.back}
      </Link>
    </main>
  );
}
