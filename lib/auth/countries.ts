/**
 * The country list behind the signup selector.
 *
 * CODES ONLY, NAMES DERIVED. The module stores ISO 3166-1 alpha-2 codes and
 * nothing else. Names come from `Intl.DisplayNames` for the active locale, and
 * flags come from the code itself — two regional-indicator code points, which
 * is what a flag emoji actually is.
 *
 * That is not cleverness for its own sake. The alternative is 249 country names
 * hand-written into `lib/strings.ts` and then again into the Czech and Russian
 * overlays, which is 747 strings to typo, to review, and to keep in step with
 * a world that renames countries. The platform already ships an ICU-capable
 * runtime; asking it for "what is CZ called in Russian" is both shorter and
 * more correct than answering that question ourselves.
 *
 * The list is the UN-recognised set plus the territories a Prague pickup-football
 * player plausibly holds a passport from. It is deliberately not filtered down
 * to "countries we expect": a signup form that cannot express where someone is
 * from is a form that tells them they are unexpected.
 */

/**
 * ISO 3166-1 alpha-2, sorted by code. Kept as one string rather than an array
 * literal so the diff stays legible when the list changes — a renamed or added
 * territory is a two-character edit, not a re-indented block.
 */
const CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ " +
  "CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI " +
  "FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM " +
  "JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG " +
  "MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK " +
  "PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ " +
  "TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW";

export const COUNTRY_CODES: readonly string[] = Object.freeze(CODES.trim().split(/\s+/));

const CODE_SET = new Set(COUNTRY_CODES);

/** ISO 3166-1 alpha-2 shape. Mirrors the `players_country_iso3166` CHECK. */
export function isCountryCodeShape(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

/**
 * Whether this is a code the selector offers.
 *
 * Shape and membership are separate questions: `ZZ` is well-shaped and not a
 * country, and the database CHECK only knows about shape. The RPC rejects
 * anything outside the shape; this rejects anything outside the list, which is
 * what the form should be held to.
 */
export function isKnownCountry(value: string | null | undefined): boolean {
  return typeof value === "string" && CODE_SET.has(value.trim().toUpperCase());
}

/** Normalises user input to the stored shape, or null if it is not a country. */
export function normaliseCountry(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return CODE_SET.has(upper) ? upper : null;
}

/**
 * The flag emoji for a code.
 *
 * A flag emoji is two regional-indicator symbols, one per letter — so it is
 * computed, never stored. Platforms that cannot render a flag (Windows, most
 * notably) fall back to showing the two letters, which is a perfectly usable
 * outcome and the reason the code is never the *only* label.
 */
export function countryFlag(code: string): string {
  if (!isCountryCodeShape(code)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (code.charCodeAt(0) - 65),
    A + (code.charCodeAt(1) - 65),
  );
}

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

/**
 * The selector's options, named in `locale` and sorted by name in that locale.
 *
 * Sorting is `localeCompare` with the same locale, because alphabetical order
 * is a property of the language, not of the byte values: Czech sorts Č after C,
 * and Russian sorts an entirely different alphabet.
 *
 * If the runtime has no ICU data for a region the code stands in as its own
 * name, so the option still exists and can still be chosen.
 */
export function countryOptions(locale = "en"): CountryOption[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    display = null;
  }

  const options = COUNTRY_CODES.map((code) => ({
    code,
    name: display?.of(code) ?? code,
    flag: countryFlag(code),
  }));

  const collator = new Intl.Collator(locale);
  return options.sort((a, b) => collator.compare(a.name, b.name));
}
