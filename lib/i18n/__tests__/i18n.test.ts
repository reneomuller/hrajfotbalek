import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { resolveStrings } from "@/lib/i18n/resolve";
import { LOCALES, isLocale, localeFromAcceptLanguage } from "@/lib/i18n/locales";
import { strings } from "@/lib/strings";

/**
 * The sections that MUST be fully translated.
 *
 * This list is the contract. `admin`, `emails` and `privacy` are absent on
 * purpose — see lib/i18n/locales.ts — and `brand` is a name, not copy.
 */
const PLAYER_FACING = [
  "meta",
  "nav",
  "siteFooter",
  "notFound",
  "landing",
  "auth",
  "games",
  "booking",
  "payment",
  "account",
  "errors",
  "common",
  // Contract §6, delivered 2026-08-01. Czech is Oliver's; Russian is a flagged
  // draft. Both are real translations, which is what this list demands.
  "faq",
  // Contract §8, Phase 16. Five toasts, and every one of them is read by a
  // player at the moment something happened to their booking or their money —
  // which is the worst possible moment to be shown a language they do not
  // read.
  "toast",
] as const;

/**
 * Keys that stay English (or Czech) in every language, with the reason.
 *
 * Anything listed here is exempt from the completeness check below. The list
 * is deliberately short and every entry is a decision, not an omission.
 */
const INTENTIONALLY_UNTRANSLATED = new Set([
  // Money. `formatCzk()` renders CZK in every language, and the amount has to
  // match what the Czech banking app shows.
  "common.czk",
  // Brand and design furniture, identical in all three languages.
  "siteFooter.copyright",
  "siteFooter.contactEmail",
  "notFound.code",
  "landing.headlineLead",
  "landing.headlineAccent",
  "landing.nextMatchEyebrow",
  "landing.community.whatsappUrl",
  "landing.community.instagram",
  "landing.community.instagramUrl",
  "landing.footer.wordmarkLead",
  "landing.footer.wordmarkAccent",
  "games.rosterUnknown",
  // The admin panel is English; this is the label of its door.
  "nav.admin",
  "nav.cta",
  // Mailto plumbing, not prose.
  "account.deleteMailto",
  // "you@example.com" is an example address, not a sentence — it reads the
  // same in all three languages and localising the domain would be noise.
  "auth.emailPlaceholder",
]);

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();

  if (typeof value === "string") {
    out.set(prefix, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      for (const [k, v] of flatten(item, `${prefix}[${i}]`)) out.set(k, v);
    });
    return out;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [k, v] of flatten(child, path)) out.set(k, v);
    }
  }

  return out;
}

describe("locale detection", () => {
  it("accepts exactly the three supported codes", () => {
    expect(LOCALES).toEqual(["en", "cs", "ru"]);
    expect(isLocale("cs")).toBe(true);
    expect(isLocale("sk")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("reads a browser's own priority order and takes the first supported match", () => {
    expect(localeFromAcceptLanguage("cs-CZ,cs;q=0.9,en;q=0.8")).toBe("cs");
    expect(localeFromAcceptLanguage("ru-RU,ru;q=0.9")).toBe("ru");
    expect(localeFromAcceptLanguage("en-GB,en;q=0.9")).toBe("en");
  });

  it("skips unsupported languages rather than giving up at the first one", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,cs;q=0.7")).toBe("cs");
  });

  it("returns null when nothing matches, so the caller picks the default", () => {
    expect(localeFromAcceptLanguage("de-DE,fr;q=0.8")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage("")).toBeNull();
  });
});

describe("resolveStrings", () => {
  it("returns the English table untouched for en", () => {
    expect(resolveStrings("en")).toBe(strings);
  });

  it("overlays the translation without dropping untranslated sections", () => {
    const t = resolveStrings("cs");
    expect(t.games.listTitle).toBe("Nadcházející zápasy");
    // Admin is deliberately not translated — it must still be there, in English.
    expect(t.admin.gamesTitle).toBe(strings.admin.gamesTitle);
    expect(t.emails.spotHeld.subject).toBe(strings.emails.spotHeld.subject);
  });

  it("keeps money in CZK in every language", () => {
    for (const locale of LOCALES) {
      expect(resolveStrings(locale).common.czk).toBe("CZK");
    }
  });

  it("keeps the Czech payment vocabulary in every language", () => {
    // The player is about to open a Czech banking app. A translated reference
    // field is a payment that arrives unmatched.
    expect(resolveStrings("cs").payment.variableSymbol).toContain("VS");
    expect(resolveStrings("ru").payment.variableSymbol).toContain("VS");
    expect(resolveStrings("en").payment.variableSymbol).toMatch(/Variable symbol|VS/);
  });

  it("returns the same object on repeat calls, so the merge is not per-render", () => {
    expect(resolveStrings("ru")).toBe(resolveStrings("ru"));
  });

  it("preserves interpolation placeholders the callers substitute into", () => {
    for (const locale of LOCALES) {
      const t = resolveStrings(locale);
      expect(t.games.waitlistPosition).toContain("{position}");
      expect(t.games.shareMessage).toContain("{venue}");
      expect(t.games.shareMessage).toContain("{when}");
      expect(t.games.shareMessage).toContain("{url}");
      expect(t.booking.cancelReassuranceCutoff).toContain("{hours}");
    }
  });

  it("replaces ordered copy blocks wholesale rather than by index", () => {
    // A half-translated list would change language halfway down.
    const steps = resolveStrings("ru").landing.steps;
    expect(steps).toHaveLength(strings.landing.steps.length);
    for (const step of steps) {
      expect(step.title).not.toBe("");
      expect(step.index).toMatch(/^\d\d$/);
    }
  });
});

describe.each([
  ["cs", cs],
  ["ru", ru],
] as const)("%s translation completeness", (locale, overlay) => {
  const english = flatten(strings);
  const translated = flatten(resolveStrings(locale));

  it("covers every player-facing key", () => {
    const missing: string[] = [];

    for (const section of PLAYER_FACING) {
      for (const [key, englishValue] of english) {
        if (!key.startsWith(`${section}.`) && key !== section) continue;
        if (INTENTIONALLY_UNTRANSLATED.has(key)) continue;
        // Placeholders, arrows and punctuation-only values are the same in
        // every language; "→" is not an untranslated string.
        if (!/\p{L}/u.test(englishValue)) continue;
        if (translated.get(key) === englishValue) missing.push(key);
      }
    }

    expect(missing).toEqual([]);
  });

  it("translates nothing outside the player-facing sections", () => {
    // A translated admin or email key would ship copy nobody reviewed into a
    // surface that is supposed to be English — and email has no per-player
    // language to pick from in the first place.
    const stray = Object.keys(overlay).filter(
      (key) => !(PLAYER_FACING as readonly string[]).includes(key),
    );
    expect(stray).toEqual([]);
  });
});
