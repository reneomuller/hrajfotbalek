/**
 * Which revision of the legal documents a player is being asked to accept,
 * and who the operator behind them is.
 *
 * THE DOCUMENTS ARE THE LAWYER'S, delivered 2026-10-15 as version 2.0 and
 * published 2026-10-19: `content/legal/original/`, rendered by
 * `lib/content/legalDocuments.ts`. They replace the 1.0 terms of 2026-08-01
 * and the DRAFT privacy placeholder.
 *
 * CZECH ONLY, AND THAT REPLACES THE 2026-08-01 RULING. That ruling said a
 * language without an authored document falls back to English behind a
 * notice. There is no English any more: contracts are concluded in Czech
 * (Terms 1.5), and the lawyer delivered Czech alone. So every locale shows the
 * Czech text, and every locale except Czech is told, in its own language,
 * that the Czech text binds. The documents are never machine-translated — an
 * unreviewed translation of a legally operative text is worse than the
 * original in a language the reader can identify.
 *
 * Each version string equals the "verze" printed in its document's header,
 * and a unit test holds them together: these strings are stamped onto
 * consent records, so the record of what someone agreed to and the words they
 * were shown cannot drift apart. Bump one when, and only when, its words
 * change.
 */
export const TERMS_VERSION = "2.0" as const;

export const PRIVACY_VERSION = "2.0" as const;

export const COOKIES_VERSION = "2.0" as const;

/**
 * The operator, from the lawyer's brief (item 1.1) and the owner's ruling of
 * 2026-10-19: the operator is Playllu, the holding company. General and
 * consumer matters go to `email`; personal-data matters to `privacyEmail`.
 * No phone number is published yet.
 *
 * Facts rather than copy, which is why they live here and not in
 * `lib/strings.ts`: an address is the same string in every language.
 */
export const OPERATOR_CONTACT = {
  name: "Playllu",
  email: "info@playllu.com",
  privacyEmail: "privacy@hrajfotbal.com",
  /** Česká obchodní inspekce — the out-of-court body for consumer disputes. */
  adrUrl: "https://coi.gov.cz/mimosoudni-reseni-spotrebitelskych-sporu-adr/",
} as const;

/** Where the terms are published as a PDF (the lawyer's brief, item 1.2). */
export const TERMS_PDF_PATH = "/legal/obchodni-podminky.pdf";
