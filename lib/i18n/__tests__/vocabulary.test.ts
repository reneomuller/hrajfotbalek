import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { uk } from "@/lib/i18n/uk";
import { strings } from "@/lib/strings";

/**
 * ROUND 34, ITEM 2 — "WALLET" IS AN INTERNAL NAME AND DIES ON PLAYER SURFACES.
 *
 * THE PRODUCT HAS ONE UNIT AND IT IS THE CREDIT. The booking page says "Redeem
 * credit"; the add-guests panel said "Pay from wallet"; the cancel copy said
 * "back in your wallet"; the pass page said "goes into your wallet". Three
 * names for one thing, and two of them are the database's word for where the
 * number is kept rather than the player's word for what they have.
 *
 * `credit_ledger` KEEPS ITS NAME, and so does the admin panel. This is a
 * VOCABULARY law about what is rendered to a player, not a rename of the
 * accounting. `admin`, `brand` and `privacy` are exempt for the same reason
 * they are exempt from the translation walk: nobody plays football in them.
 *
 * EMAILS ARE IN SCOPE THOUGH THEY ARE NOT TRANSLATED. A player reads an email
 * in the same voice as the page that sent it, and "Money in the wallet" as a
 * subject line is the internal name arriving in an inbox.
 *
 * WHY A STRING-TABLE WALK RATHER THAN A PAGE CRAWL. This sees every key,
 * including the ones only one error path renders — a crawl sees what it
 * happened to visit. `e2e/vocabulary.spec.ts` does the crawl as well, because
 * a string-table walk cannot see a word hardcoded into a component.
 */

/** The internal word, in every language this product speaks. */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "wallet (en)", pattern: /\bwallets?\b/i },
  // Czech `peněženka` declines: peněženka / peněženky / peněžence / peněženku /
  // peněžence / peněženkou. The stem is what is matched.
  { label: "peněženka (cs)", pattern: /pen[ěe]žen/i },
  // Russian кошелёк / кошелька / кошельке / кошельком, and the ё/е spelling.
  { label: "кошелёк (ru)", pattern: /кошель|кошелёк|кошелек/i },
  // Ukrainian гаманець / гаманця / гаманці / гаманцем.
  { label: "гаманець (uk)", pattern: /гаман/i },
];

/** Sections nobody plays football in. Same exemptions as the translation walk. */
const EXEMPT_SECTIONS = new Set(["admin", "brand", "privacy"]);

type Table = Record<string, unknown>;

function walk(table: Table, prefix: string[] = []): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(table)) {
    const path = [...prefix, key];
    if (prefix.length === 0 && EXEMPT_SECTIONS.has(key)) continue;
    if (typeof value === "string") out.push([path.join("."), value]);
    else if (value && typeof value === "object") out.push(...walk(value as Table, path));
  }
  return out;
}

describe.each([
  ["en", strings as unknown as Table],
  ["cs", cs as unknown as Table],
  ["ru", ru as unknown as Table],
  ["uk", uk as unknown as Table],
])("%s renders no internal vocabulary", (locale, table) => {
  const entries = walk(table);

  it("has strings to check at all", () => {
    // A walk that found nothing would pass every assertion below.
    expect(entries.length).toBeGreaterThan(20);
  });

  for (const { label, pattern } of FORBIDDEN) {
    it(`says nothing about ${label}`, () => {
      const offenders = entries
        .filter(([, value]) => pattern.test(value))
        .map(([path, value]) => `${path}: ${JSON.stringify(value)}`);

      expect(
        offenders,
        `${locale} renders the internal word to a player in ${offenders.length} place(s)`,
      ).toEqual([]);
    });
  }
});
