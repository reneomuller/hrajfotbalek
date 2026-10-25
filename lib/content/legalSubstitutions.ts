/**
 * The documented edits to the lawyer's documents, applied to the raw HTML.
 *
 * NO IMPORTS, ON PURPOSE. `scripts/legal/build-legal.mjs` imports this file
 * directly under Node's type stripping to print the PDF, and a path alias or a
 * JSON import would not resolve there. The rules themselves are data, in
 * `content/legal/substitutions.json`, read by both callers.
 *
 * A RULE THAT MATCHES THE WRONG NUMBER OF TIMES THROWS. A revised lawyer file
 * that moved or removed a placeholder must stop the build rather than publish
 * a document with a blank in it, or with an edit landing somewhere new.
 */

export interface LegalSubstitutionRule {
  document: string;
  find: string;
  replace: string;
  count: number;
  why: string;
  /**
   * Round 40: a rule that applies only while a GTM container is configured —
   * the cookie table's analytics and marketing rows, which must not be listed
   * while those cookies are not in use.
   */
  when?: string;
}

export interface LegalSubstitutionOptions {
  /** Whether a GTM container is configured (`lib/analytics/gtm.ts`). */
  analytics?: boolean;
}

export function applyLegalSubstitutions(
  documentId: string,
  html: string,
  rules: readonly LegalSubstitutionRule[],
  options: LegalSubstitutionOptions = {},
): string {
  return rules
    .filter((rule) => rule.document === documentId)
    .filter((rule) => rule.when === undefined || (rule.when === "analytics" && options.analytics === true))
    .reduce((current, rule) => {
      const parts = current.split(rule.find);
      const found = parts.length - 1;
      if (found !== rule.count) {
        throw new Error(
          `legal substitution for ${documentId} matched ${found} times, expected ${rule.count}: ${rule.why}`,
        );
      }
      return parts.join(rule.replace);
    }, html);
}
