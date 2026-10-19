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
export const TERMS_RULES_ANCHOR = "pravidla";

/** The original HTML with the documented substitutions applied. */
export function legalDocumentHtml(name: LegalDocumentName): string {
  const id = LEGAL_DOCUMENT_ORIGINAL[name];
  return applyLegalSubstitutions(id, LEGAL_ORIGINALS[id], substitutions.rules);
}

const parsed = new Map<LegalDocumentName, ParsedLegalDocument>();

export function loadLegalDocument(name: LegalDocumentName): ParsedLegalDocument {
  const cached = parsed.get(name);
  if (cached) return cached;
  const document = parseLegalHtml(legalDocumentHtml(name));
  parsed.set(name, document);
  return document;
}
