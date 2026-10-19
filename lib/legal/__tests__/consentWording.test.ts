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

  it("stores the lawyer's Czech verbatim", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const wording = signupTermsWording(t);

    // Assert
    expect(wording).toBe(
      "Seznámil(a) jsem se s Obchodními podmínkami a s Pravidly komunity a hry a souhlasím s nimi. Beru na vědomí, že Playllu zápasy neorganizuje a že se jich účastním na vlastní nebezpečí. Uděluji svolení k pořizování fotografií a videí ze Zápasů a k jejich užití pro marketing a na sociálních sítích Playllu podle článku 13 Obchodních podmínek.",
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
