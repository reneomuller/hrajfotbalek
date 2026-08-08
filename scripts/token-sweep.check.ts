import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No retired token name survives outside `tailwind.config.ts`.
 *
 * WHY THIS IS A CHECK RATHER THAN A ONE-OFF GREP. The retiring names still
 * RESOLVE — they are aliases pointing at their surviving values, kept so that
 * Phase 15's token change could land without 83 files silently degrading, and
 * deleted only once nothing names them. That is exactly the condition under
 * which a name creeps back: writing `text-chalk` today produces the right
 * colour, so nothing tells you it is wrong, and the alias can never be removed
 * because a call site appeared while nobody was looking.
 *
 * An ungenerated Tailwind class is not a build error either — it is simply no
 * CSS — so `npm run build` will never catch this. This file is the only thing
 * that does.
 *
 * It lives in `scripts/` and runs under `npm run test:integration` rather than
 * the unit suite, because it walks the repository from disk.
 */

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Every name retired by ruling A, with what it became.
 *
 * `hint`, `hairline-panel` and `rounded-panel` are here too even though they
 * had zero call sites when they were deleted — a token with no usages is
 * exactly the one someone reintroduces, because nothing in the diff argues
 * against it.
 */
const RETIRED: ReadonlyArray<{ name: string; became: string }> = [
  // Greys — nine tones became three.
  { name: "chalk", became: "bone" },
  { name: "muted-dim", became: "muted" },
  { name: "subtle", became: "muted" },
  { name: "footer-dim", became: "muted" },
  { name: "hint", became: "faint" },
  { name: "dim", became: "faint" },
  // Hairlines — nine became three.
  { name: "hairline-soft", became: "hairline" },
  { name: "hairline-chrome", became: "hairline" },
  { name: "hairline-panel", became: "hairline" },
  { name: "hairline-link", became: "hairline-strong" },
  { name: "hairline-volt-soft", became: "hairline-volt" },
  { name: "hairline-volt-strong", became: "hairline-volt" },
  // Surfaces — the translucent family went opaque.
  { name: "surface-card", became: "surface" },
  { name: "surface-card-strong", became: "surface" },
  { name: "surface-panel", became: "surface" },
];

/** Radii are their own utility prefix, so they get their own list. */
const RETIRED_RADII: ReadonlyArray<{ name: string; became: string }> = [
  { name: "chip", became: "pill" },
  { name: "badge", became: "pill" },
  { name: "cta", became: "control" },
  { name: "panel", became: "card" },
];

/** Shadows retired outright, with no replacement. */
const RETIRED_SHADOWS = ["volt-glow", "volt-glow-lg"] as const;

const COLOR_PREFIX =
  "(?:text|bg|border|ring|fill|stroke|decoration|placeholder|from|to|via|divide|outline|accent|caret)";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.has(path.extname(full))) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(path.resolve(process.cwd(), root)));

/** Every occurrence of `pattern`, as `path:line` strings a human can open. */
function findAll(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A fresh regex per line: `g` flags carry lastIndex between calls, and a
      // check that silently skips every other match is worse than no check.
      if (new RegExp(pattern.source).test(line)) {
        hits.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  return hits;
}

describe("the ruling A sweep is complete", () => {
  it.each(RETIRED)("no call site names the retired colour $name (now $became)", ({ name }) => {
    const hits = findAll(new RegExp(`\\b${COLOR_PREFIX}-${name}(?![-\\w])`));
    expect(hits, `still referenced:\n${hits.join("\n")}`).toEqual([]);
  });

  it.each(RETIRED_RADII)("no call site names the retired radius $name (now $became)", ({ name }) => {
    const hits = findAll(new RegExp(`\\brounded-${name}(?![-\\w])`));
    expect(hits, `still referenced:\n${hits.join("\n")}`).toEqual([]);
  });

  it.each(RETIRED_SHADOWS)("no call site names the retired shadow %s", (name) => {
    const hits = findAll(new RegExp(`\\bshadow-${name}(?![-\\w])`));
    expect(hits, `still referenced:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("the check itself works", () => {
  /*
   * A sweep check that cannot fail is a sweep check that proves nothing, and
   * every assertion above is an empty-array comparison — which is also what a
   * broken file walker returns.
   */
  it("is actually reading files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds a token that IS present, so an empty result means absent", () => {
    // `bone` is the surviving primary text tone and is used all over.
    const hits = findAll(new RegExp(`\\b${COLOR_PREFIX}-bone(?![-\\w])`));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does not confuse a retired name with a surviving one that contains it", () => {
    // `dim` is retired; `volt-dim` survives. A naive substring match would
    // report every `text-volt-dim` as a violation and the check would be
    // switched off within a day.
    const retiredDim = findAll(new RegExp(`\\b${COLOR_PREFIX}-dim(?![-\\w])`));
    expect(retiredDim).toEqual([]);

    const survivingVoltDim = findAll(new RegExp(`\\b${COLOR_PREFIX}-volt-dim(?![-\\w])`));
    expect(survivingVoltDim.length).toBeGreaterThan(0);
  });
});
