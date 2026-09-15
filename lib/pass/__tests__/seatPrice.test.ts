import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { uk } from "@/lib/i18n/uk";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";
import { strings } from "@/lib/strings";

/**
 * ROUND 35 v2, ITEM 2 — THE SWEEP. Nothing about 150 survives.
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
const NOT_MONEY = ["components/PitchBackground.tsx"];

/** 150 doing the job of a price, on one line. */
const MONEY_150 =
  /(czk|price|credit|amount|balance|tier|cost|paid|delta)[^\n]{0,40}\b150\b|\b150\b[^\n]{0,40}(czk|kč|price|credit)/i;

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
  it("is 180", () => {
    expect(PASS_REFERENCE_PRICE_CZK).toBe(180);
  });

  it("appears as 150 nowhere in the source that runs", () => {
    const offenders: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of walk(root)) {
        if (NOT_MONEY.includes(file)) continue;
        const code = withoutComments(readFileSync(file, "utf8"));
        code.split("\n").forEach((line, i) => {
          if (MONEY_150.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("appears as 150 nowhere a player can read", () => {
    const offenders: string[] = [];
    const walkTable = (table: Record<string, unknown>, path: string[] = []) => {
      for (const [key, value] of Object.entries(table)) {
        if (path.length === 0 && key === "admin") continue;
        if (typeof value === "string") {
          if (/\b150\b/.test(value)) offenders.push(`${[...path, key].join(".")}: ${value}`);
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
