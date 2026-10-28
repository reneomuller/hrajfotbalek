import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import {
  bookingTermsWording,
  signupTermsWording,
  waiverWording,
} from "@/lib/legal/consentWording";

/**
 * A consent record stores the WORDS the player saw (Texty 2.4), so each one
 * must come out as finished prose in every language — no `{slot}` left behind.
 */
describe("consent wording", () => {
  it("fills every link into the sign-up sentence, in every language", () => {
    // Arrange
    const tables = LOCALES.map((locale) => resolveStrings(locale));

    // Act
    const wordings = tables.map((t) => signupTermsWording(t));

    // Assert
    for (const [i, wording] of wordings.entries()) {
      expect(wording).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(wording).toContain(tables[i]!.auth.tosTermsLink);
      expect(wording).toContain(tables[i]!.auth.tosRulesLink);
    }
  });

  it("stores the lawyer's Czech, minus the risk sentence the owner removed", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const wording = signupTermsWording(t);

    // Assert
    expect(wording).toBe(
      "Seznámil(a) jsem se s Obchodními podmínkami a s Pravidly komunity a hry a souhlasím s nimi. Uděluji svolení k pořizování fotografií a videí ze Zápasů a k jejich užití pro marketing a na sociálních sítích Playllu podle článku 13 Obchodních podmínek.",
    );
  });

  it("fills the booking box and leaves the waiver as written", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const booking = bookingTermsWording(t);
    const waiver = waiverWording(t);

    // Assert
    expect(booking).toBe("Souhlasím s Obchodními podmínkami.");
    expect(waiver).toMatch(/^Žádám o okamžité dodání Kreditů po zaplacení/);
  });
});

/**
 * Owner, 2026-10-27: "we have it in the ToS, that's enough". The "we don't
 * organise the games / own risk" sentence left the sign-up box and the booking
 * summary in every language; Obchodní podmínky 3.2 and 12 keep it.
 */
describe("the risk sentence", () => {
  const RISK = /neorganizuje|own risk|страх и риск|власний ризик|не организует|не організовує/i;

  it("is in no sign-up box and no booking summary, in any language", () => {
    // Arrange
    const tables = LOCALES.map((locale) => resolveStrings(locale));

    // Act
    const texts = tables.flatMap((t) => [signupTermsWording(t), t.purchase.reservationSummary]);

    // Assert
    for (const text of texts) expect(text).not.toMatch(RISK);
  });
});

/**
 * Owner, 2026-10-28: "playllu -> hrajfotbal newsletter". Players sign up to
 * Hraj Fotbal; Playllu is the operator the terms name, not a brand they know.
 */
describe("the newsletter box", () => {
  it("names Hraj Fotbal, not Playllu, in every language", () => {
    // Arrange
    const tables = LOCALES.map((locale) => resolveStrings(locale));

    // Act
    const labels = tables.map((t) => t.auth.marketingLabel);

    // Assert
    for (const label of labels) {
      expect(label).toContain("Hraj Fotbal");
      expect(label).not.toMatch(/playllu/i);
    }
  });
});
