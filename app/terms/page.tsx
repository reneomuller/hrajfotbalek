import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_RULES_ANCHOR } from "@/lib/content/legalDocuments";
import { TERMS_PDF_PATH } from "@/lib/legal";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.legal.termsTitle };
}

/**
 * `/terms` — Obchodní podmínky, version 2.0, with Příloha 1 (Pravidla
 * komunity a hry) beneath them.
 *
 * The lawyer's text, verbatim, in Czech for every reader — see
 * `lib/content/legalDocuments.ts`. The rules attachment is anchored at
 * `#pravidla` because signup links straight to it, and the PDF beside the page
 * is the same text printed from the same file (the lawyer's brief, item 1.2).
 */
export default function TermsPage() {
  return <LegalPage name="terms" pdfHref={TERMS_PDF_PATH} annexAnchor={TERMS_RULES_ANCHOR} />;
}
