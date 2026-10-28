import { describe, expect, it } from "vitest";
import { emailLocaleToRecord, localeFromMetadata } from "@/lib/email/recipientLocale";

/**
 * ROUND 41 — "identify the browser's language for people to receive emails in
 * that language … or during sign up, add a communications language
 * preference".
 */
describe("localeFromMetadata", () => {
  it("prefers the language chosen for emails", () => {
    // Act
    const locale = localeFromMetadata({ email_locale: "uk", consent_locale: "cs" });

    // Assert
    expect(locale).toBe("uk");
  });

  it("falls back to the language the terms were read in at signup", () => {
    // Act
    const locale = localeFromMetadata({ consent_locale: "cs" });

    // Assert
    expect(locale).toBe("cs");
  });

  it("knows nothing from nothing, or from a value that is not a language", () => {
    // Act / Assert
    expect(localeFromMetadata(null)).toBeNull();
    expect(localeFromMetadata({ email_locale: "de" })).toBeNull();
  });
});

describe("emailLocaleToRecord", () => {
  it("records the browser's language for an account that has none", () => {
    // Act
    const locale = emailLocaleToRecord({ nickname: "x" }, "ru");

    // Assert
    expect(locale).toBe("ru");
  });

  it("records nothing when the account already has a language", () => {
    // Act / Assert
    expect(emailLocaleToRecord({ email_locale: "en" }, "cs")).toBeNull();
    expect(emailLocaleToRecord({ consent_locale: "uk" }, "cs")).toBeNull();
  });
});
