/**
 * Copies the flags this product's country list needs out of
 * `country-flag-icons` and into `public/flags/3x2`.
 *
 * DERIVED, NOT CURATED. `lib/auth/countries.ts` is the list; this script is how
 * the asset directory follows it. Adding a country there and forgetting to run
 * this would render a broken image, which is why
 * `lib/auth/__tests__/flagCoverage.test.ts` asserts the two agree on every run.
 *
 * SERVED RATHER THAN BUNDLED, and the numbers are the reason: 197 React flag
 * components is 111 KB pulled into a page that draws one flag. An `<img>`
 * fetches exactly the country in front of the reader.
 *
 * Run: node scripts/sync-flags.mjs
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "node_modules/country-flag-icons/3x2";
const TARGET = "public/flags/3x2";

const codes = readFileSync("lib/auth/countries.ts", "utf8")
  .match(/const CODES =([\s\S]*?);/)[1]
  .replace(/["+\n]/g, " ")
  .trim()
  .split(/\s+/)
  .filter((c) => /^[A-Z]{2}$/.test(c));

const available = new Set(readdirSync(SOURCE).map((f) => f.replace(".svg", "")));
const missing = codes.filter((c) => !available.has(c));
if (missing.length > 0) {
  console.error(`No flag for: ${missing.join(", ")}`);
  process.exit(1);
}

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });
let bytes = 0;
for (const code of codes) {
  const data = readFileSync(join(SOURCE, `${code}.svg`));
  bytes += data.length;
  writeFileSync(join(TARGET, `${code}.svg`), data);
}
console.log(`${codes.length} flags, ${Math.round(bytes / 1024)} KB`);
