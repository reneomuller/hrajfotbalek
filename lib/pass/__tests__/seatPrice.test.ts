import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { uk } from "@/lib/i18n/uk";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";
import { priceForDurationCzk } from "@/lib/games/price";
import { strings } from "@/lib/strings";

/**
 * ROUND 35 v5, ITEM 2 — THE SWEEP. No stale flat-price assumption survives.
 *
 * ~~Nothing about 150 survives.~~ THAT WAS v2, WHEN EVERY GAME COST 180. The
 * rule now is narrower and harder: **150 exists only as the 60-minute price,
 * 180 only as the 90-minute price and the credit nominal**, and both come from
 * a mapping rather than from a literal. So a bare price in the source is an
 * offence whichever of the two numbers it is — the point is not which number,
 * it is that somebody wrote one down instead of asking.
 *
 * THE PRICE MOVED FROM 150 TO 180 AND THE OWNER'S CONDITION WAS THAT NO TRACE
 * OF THE OLD ONE IS LEFT, in the copy or in the logic. A grep by hand proves
 * that once; this proves it on every run, which is the difference between a
 * migration and a rule.
 *
 * WHAT IT LOOKS FOR, AND WHY IT IS NOT JUST `/150/`. A bare 150 is a legitimate
 * number — `PitchBackground` draws with it, a timeout could be it. What is
 * banned is 150 standing in for MONEY, so the scan pairs the number with a
 * money word on the same line. That catches `priceCzk: 150`, `= 150`, `150 CZK`
 * and `credited_czk = games * 150`, and leaves a canvas radius alone.
 *
 * THE STRING TABLES ARE SCANNED WHOLE, because in copy any 150 is a price.
 */

const SOURCE_ROOTS = ["lib", "app", "components", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__"]);
/** A canvas, not a cashier — see `PitchBackground`'s own header. */
const NOT_MONEY = [
  "components/PitchBackground.tsx",
  /*
   * THE TWO FILES ALLOWED TO SAY THE NUMBERS, because they are where the
   * numbers are DEFINED. `price.ts` is the duration mapping and `creditPrice.ts`
   * is the credit nominal; everything else has to call one of them. Exempting
   * the definitions is what makes the rule about copies rather than about
   * arithmetic existing at all.
   */
  "lib/games/price.ts",
  "lib/pass/creditPrice.ts",
  /*
   * COPY IS SCANNED BY THE WALK BELOW, NOT BY THIS ONE. `lib/strings.ts` is a
   * table of sentences, and the sentence that has to name both prices is the
   * ADMIN'S hint — "60 minutes is 150 CZK, 90 is 180" — which is the product
   * explaining its own mapping to the person who sets a duration. The
   * string-table walk knows `admin` is exempt and a player-facing string is
   * not; this file-level scan cannot tell them apart, and running a cruder rule
   * over the same text is how a correct sentence gets deleted to satisfy a test.
   */
  "lib/strings.ts",
];

/** Either price doing the job of a price, on one line. */
const HARDCODED_PRICE =
  /(czk|price|credit|amount|balance|tier|cost|paid|delta)[^\n]{0,40}\b(150|180)\b|\b(150|180)\b[^\n]{0,40}(czk|kč|price|credit)/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** Drops `//` and `/* *\/` so a historical note is not a live price. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the seat price", () => {
  it("is 180 as the credit nominal, and 150/180 as the two game prices", () => {
    expect(PASS_REFERENCE_PRICE_CZK).toBe(180);
    expect(priceForDurationCzk(60)).toBe(150);
    expect(priceForDurationCzk(90)).toBe(180);
  });

  it("is written down nowhere else in the source that runs", () => {
    const offenders: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of walk(root)) {
        if (NOT_MONEY.includes(file)) continue;
        const code = withoutComments(readFileSync(file, "utf8"));
        code.split("\n").forEach((line, i) => {
          if (HARDCODED_PRICE.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("is quoted at a player nowhere", () => {
    const offenders: string[] = [];
    const walkTable = (table: Record<string, unknown>, path: string[] = []) => {
      for (const [key, value] of Object.entries(table)) {
        if (path.length === 0 && key === "admin") continue;
        if (typeof value === "string") {
          /*
           * COPY IS ALLOWED TO NAME THE PRICES — the admin's own hint says
           * "60 minutes is 150 CZK, 90 is 180", which is the product explaining
           * its mapping to the person who sets it. `admin` is exempt from this
           * walk already; a PLAYER-facing string quoting a price is the thing
           * that goes stale, and that is what this catches.
           */
          if (/\b(150|180)\b/.test(value)) {
            offenders.push(`${[...path, key].join(".")}: ${value}`);
          }
        } else if (value && typeof value === "object") {
          walkTable(value as Record<string, unknown>, [...path, key]);
        }
      }
    };
    for (const table of [strings, cs, ru, uk]) {
      walkTable(table as unknown as Record<string, unknown>);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
