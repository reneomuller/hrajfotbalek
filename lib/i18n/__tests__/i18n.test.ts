import { describe, expect, it } from "vitest";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { resolveStrings } from "@/lib/i18n/resolve";
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localeFromAcceptLanguage,
} from "@/lib/i18n/locales";
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
  /*
   * Ruling L's profile block (Stage 3). It shipped translated in all three
   * languages and was never added here, so the completeness walk skipped it
   * entirely — six fields and four position labels that could have gone
   * untranslated without a single test complaining. Caught by the
   * "translates nothing outside the player-facing sections" half of this
   * suite, which is the direction that fires when a section is genuinely
   * translated and simply unlisted.
   */
  "profile",
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
  // Contract §4.2, Phase 20a. This is MONEY the player is deciding to spend,
  // and the expiry is the part they must read before the button. A pass page
  // in a language they cannot read is a complaint waiting to happen.
  "pass",
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
  // "Game Pass" is the product's NAME. The strapline under it is translated in
  // both overlays; the name is not, so that a player can be told about it in a
  // WhatsApp group where three languages are spoken and everyone recognises
  // the same two words on the panel.
  "pass.panelTitle",
  /*
   * "60 min" — the game card's duration (v1.3 §2.1).
   *
   * `min` is the standard abbreviation for `minuta` in Czech as well as for
   * `minute` in English, so the CS overlay repeats the English string because
   * the Czech word for it IS that string. Russian differs (`мин`) and is
   * translated, which is why only the Czech pair reaches this list.
   *
   * Abbreviated in all three deliberately: §2.13 lists the duration among the
   * four things on the card that never truncate, so it must fit beside a 28px
   * kick-off and a format pill at 390px, and "minut" spelled out does not.
   */
  "games.durationMin",
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

/**
 * THE DEFAULT IS CZECH, AND IT IS THE LAST WORD RATHER THAN THE FIRST.
 *
 * The owner iteration made Czech the default for an anonymous visitor with no
 * stored choice — the games are in Prague, and English led only because it is
 * the language the string table is written in.
 *
 * What must stay true is the PRECEDENCE, which is where a "default" quietly
 * becomes a forcing: an explicit choice outranks it, and a browser preference
 * outranks it. This asserts the resolution ladder that
 * `lib/i18n/server.ts` walks, at the level the pure functions can be tested.
 */
describe("the default locale", () => {
  it("is Czech", () => {
    expect(DEFAULT_LOCALE).toBe("cs");
  });

  it("does not displace a browser preference", () => {
    // Step 2 of the ladder. A Russian speaker's browser still gets Russian.
    expect(localeFromAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(localeFromAcceptLanguage("en-GB,en;q=0.9")).toBe("en");
  });

  it("applies only when nothing else has an opinion", () => {
    // Step 3. An unsupported language, or no header at all, lands here.
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9") ?? DEFAULT_LOCALE).toBe("cs");
    expect(localeFromAcceptLanguage(null) ?? DEFAULT_LOCALE).toBe("cs");
  });

  it("leaves ENGLISH as the fallback for missing copy, which is a different job", () => {
    /*
     * `resolveStrings` merges the overlays onto the English table, so an
     * untranslated key renders English rather than a blank. Changing the
     * default locale must not touch that — the two are easily confused
     * because both are called "the fallback".
     */
    const cs = resolveStrings("cs");
    expect(cs.games.durationMin).toBe(strings.games.durationMin);
    expect(cs.games.listTitle).not.toBe(strings.games.listTitle);
  });
});
