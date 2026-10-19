import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import {
  STRIPE_CUSTOM_TEXT_MAX,
  creditPurchaseSummary,
  creditsValidUntil,
  reservationSummary,
} from "@/lib/legal/purchaseSummary";

const PAID_AT = new Date("2026-10-19T10:00:00Z");
const TERMS_URL = "https://hrajfotbal.com/terms";
const LONG_VENUE = "Sportovní areál Strahov • Hřiště 7 (umělá tráva, vchod z Vaníčkovy ulice)";

describe("creditsValidUntil", () => {
  it("is sixty days after the Credits are added", () => {
    // Arrange
    const paidAt = PAID_AT;

    // Act
    const until = creditsValidUntil(paidAt);

    // Assert
    expect(until.toISOString()).toBe("2026-12-18T10:00:00.000Z");
  });
});

describe("creditPurchaseSummary", () => {
  it("is the lawyer's Czech, filled in", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const text = creditPurchaseSummary(
      { credits: 1, amountCzk: 180, paidAt: PAID_AT, termsUrl: TERMS_URL },
      "cs",
      t,
    );

    // Assert
    expect(text).toBe(
      "Kupuješ: 1 Kredit (1 Kredit = 1 místo na jednom Zápase). Cena celkem: 180 CZK. " +
        "Platnost Kreditů: 60 dní od připsání, tj. do 18. 12. 2026; nevyčerpané Kredity poté propadají. " +
        "Kredity lze použít jen na Rezervace Zápasů Playllu, nejsou převoditelné a nelze je vyměnit za peníze. " +
        "Kredity ti připíšeme okamžitě po zaplacení. Od nákupu Kreditů nelze odstoupit. " +
        "[Obchodní podmínky](https://hrajfotbal.com/terms)",
    );
  });

  it("names the pass when one is bought", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const text = creditPurchaseSummary(
      { credits: 5, amountCzk: 840, packageName: "Game Pass", paidAt: PAID_AT, termsUrl: TERMS_URL },
      "cs",
      t,
    );

    // Assert
    expect(text).toMatch(/^Kupuješ: Game Pass – 5 Kreditů \(/);
  });

  it("fits Stripe's 1200 characters in every language, with a twenty-Credit pass", () => {
    // Arrange
    const purchase = {
      credits: 20,
      amountCzk: 2772,
      packageName: "Game Pass",
      paidAt: PAID_AT,
      termsUrl: TERMS_URL,
    };

    // Act
    const lengths = LOCALES.map(
      (locale) => creditPurchaseSummary(purchase, locale, resolveStrings(locale)).length,
    );

    // Assert
    for (const length of lengths) expect(length).toBeLessThanOrEqual(STRIPE_CUSTOM_TEXT_MAX);
  });

  it("leaves no slot unfilled in any language", () => {
    // Arrange
    const purchase = { credits: 3, amountCzk: 540, paidAt: PAID_AT, termsUrl: TERMS_URL };

    // Act
    const texts = LOCALES.map((locale) =>
      creditPurchaseSummary(purchase, locale, resolveStrings(locale)),
    );

    // Assert
    for (const text of texts) expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});

describe("reservationSummary", () => {
  it("states the cutoff and the extension the database enforces", () => {
    // Arrange
    const t = resolveStrings("cs");

    // Act
    const text = reservationSummary(
      { when: "čtvrtek 23. října, 19:00", venue: "Strahov", credits: 1, cutoffHours: 12 },
      "cs",
      t,
    );

    // Assert
    expect(text).toContain("Rezervuješ místo na Zápase čtvrtek 23. října, 19:00, Strahov.");
    expect(text).toContain("Úhrada: 1 Kredit.");
    expect(text).toContain("nejpozději 12 hodin před začátkem");
    expect(text).toContain("prodloužíme jeho platnost o 7 dní");
  });

  it("leaves no slot unfilled in any language, even with a long venue", () => {
    // Arrange
    const booking = { when: "Thu 23 Oct, 19:00", venue: LONG_VENUE, credits: 3, cutoffHours: 12 };

    // Act
    const texts = LOCALES.map((locale) =>
      reservationSummary(booking, locale, resolveStrings(locale)),
    );

    // Assert
    for (const text of texts) expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});
