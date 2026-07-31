/**
 * Loading a legal document for a locale.
 *
 * THE DOCUMENTS ARE FILES, NOT STRINGS. `lib/strings.ts` is a UI table with a
 * partial-overlay model: a missing Czech key silently renders English, which is
 * exactly right for a button label and exactly wrong for a contract. A legal
 * text is authored whole, per language, by a person — so it lives in
 * `content/` as one file per language and is loaded by name.
 *
 * WHAT HAPPENS WHEN A LANGUAGE HAS NO DOCUMENT. It falls back to English AND
 * says so. Silently showing English to a Russian speaker who ticked a box
 * saying they accept the terms is the failure this function exists to make
 * impossible: the caller is handed `isTranslated: false` and has to render the
 * notice. The alternative — machine-translating a contract and shipping it
 * behind a "draft" label — produces a document that is legally operative and
 * unreviewed, which is worse than an honest English one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { parseMarkdown, type MarkdownBlock } from "@/lib/content/markdown";

export type LegalDocumentName = "terms";

/**
 * Which languages each document has been authored in.
 *
 * Explicit rather than "whatever files happen to exist", so adding a language
 * is a deliberate edit here and a missing file is a crash at build time rather
 * than a silent fallback in front of a player.
 */
const AUTHORED: Record<LegalDocumentName, readonly Locale[]> = {
  // Russian is absent deliberately: no reviewed Russian text exists. See the
  // header — an unreviewed translation of a contract is not an improvement.
  terms: ["en", "cs"],
};

export interface LegalDocument {
  blocks: MarkdownBlock[];
  /** The language actually rendered, which may not be the one asked for. */
  locale: Locale;
  /** False when the reader is being shown a language they did not ask for. */
  isTranslated: boolean;
}

export function hasAuthoredDocument(name: LegalDocumentName, locale: Locale): boolean {
  return AUTHORED[name].includes(locale);
}

export function loadLegalDocument(
  name: LegalDocumentName,
  locale: Locale,
): LegalDocument {
  const resolved = hasAuthoredDocument(name, locale) ? locale : DEFAULT_LOCALE;
  const file = path.resolve(process.cwd(), "content", `${name}.${resolved}.md`);

  return {
    blocks: parseMarkdown(readFileSync(file, "utf8")),
    locale: resolved,
    isTranslated: resolved === locale,
  };
}
