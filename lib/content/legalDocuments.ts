/**
 * The legal documents the site publishes, loaded by name.
 *
 * THE TEXT IS THE LAWYER'S, VERBATIM. The originals are the HTML files in
 * `content/legal/original/`, embedded by `scripts/legal/build-legal.mjs` so a
 * route ships them by importing rather than by reading `content/` at request
 * time. The only edits are the rules in `content/legal/substitutions.json` —
 * the effective date and the missing phone number — and each must match
 * exactly as often as it says or loading throws.
 *
 * CZECH IN EVERY LOCALE. Contracts are concluded in Czech (Terms 1.5) and the
 * lawyer delivered Czech only, so there is nothing else to show. A reader of
 * another language is told, in their language, that the Czech text is the
 * binding one; the documents themselves are never machine-translated.
 */

import substitutions from "@/content/legal/substitutions.json";
import { gtmEnabled } from "@/lib/analytics/gtm";
import { LEGAL_ORIGINALS, type LegalOriginalId } from "@/lib/content/legalOriginals.generated";
import { parseLegalHtml, type ParsedLegalDocument } from "@/lib/content/legalHtml";
import { applyLegalSubstitutions } from "@/lib/content/legalSubstitutions";

export type LegalDocumentName = "terms" | "privacy" | "cookies";

export const LEGAL_DOCUMENT_ORIGINAL: Record<LegalDocumentName, LegalOriginalId> = {
  terms: "obchodni-podminky",
  privacy: "zasady-zpracovani-osobnich-udaju",
  cookies: "zasady-pouzivani-cookies",
};

/** The language every legal document is published in. */
export const LEGAL_DOCUMENT_LOCALE = "cs" as const;

/** The anchor of the terms' Příloha 1 — the signup box links to `/terms#pravidla`. */
// Lives in `lib/legal.ts` since round 41, so the emails can link to it without
// importing every legal document; re-exported here for the pages that always did.
export { TERMS_RULES_ANCHOR } from "@/lib/legal";

/** The original HTML with the documented substitutions applied. */
/**
 * `analytics` (round 40): whether the `when: "analytics"` rules apply — the
 * cookie table lists Google's and Meta's cookies only while GTM is configured.
 */
export function legalDocumentHtml(
  name: LegalDocumentName,
  analytics: boolean = gtmEnabled(),
): string {
  const id = LEGAL_DOCUMENT_ORIGINAL[name];
  return applyLegalSubstitutions(id, LEGAL_ORIGINALS[id], substitutions.rules, { analytics });
}

const parsed = new Map<string, ParsedLegalDocument>();

export function loadLegalDocument(
  name: LegalDocumentName,
  analytics: boolean = gtmEnabled(),
): ParsedLegalDocument {
  const key = `${name}:${analytics}`;
  const cached = parsed.get(key);
  if (cached) return cached;
  const document = parseLegalHtml(legalDocumentHtml(name, analytics));
  parsed.set(key, document);
  return document;
}
