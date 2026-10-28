import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "@/lib/auth/countries";
import {
  composePhone,
  dialCode,
  formatPhone,
  splitPhone,
  withComposedPhone,
} from "@/lib/auth/phone";

/**
 * ROUND 41 — "Country code prefix at signup through dropdown flag selection
 * with the prefix next to it." The player picks a country and types the
 * national number; what is stored is one international number.
 */
describe("dialCode", () => {
  it("is the country's calling code with its plus", () => {
    // Act / Assert
    expect(dialCode("CZ")).toBe("+420");
    expect(dialCode("UA")).toBe("+380");
    expect(dialCode("XK")).toBe("+383");
  });

  it("exists for every country the signup list offers", () => {
    // Act
    const missing = COUNTRY_CODES.filter((code) => dialCode(code) === null);

    // Assert
    expect(missing).toEqual([]);
  });

  it("is null for a country it does not know", () => {
    // Act / Assert
    expect(dialCode("ZZ")).toBeNull();
    expect(dialCode(null)).toBeNull();
  });
});

describe("composePhone", () => {
  it("prefixes a national number with the chosen country's code", () => {
    // Act
    const phone = composePhone("CZ", "777 123 456");

    // Assert
    expect(phone).toBe("+420777123456");
  });

  it("drops the national trunk zero the way an international number does", () => {
    // Act
    const phone = composePhone("GB", "07700 900123");

    // Assert
    expect(phone).toBe("+447700900123");
  });

  it("keeps a number typed in full international form, whatever the dropdown says", () => {
    // Act / Assert
    expect(composePhone("CZ", "+380 67 123 4567")).toBe("+380671234567");
    expect(composePhone("CZ", "00420 777 123 456")).toBe("+420777123456");
  });

  it("returns an empty string for an empty number, so the required check still fires", () => {
    // Act / Assert
    expect(composePhone("CZ", "   ")).toBe("");
  });

  it("falls back to the code plus the digits when the number cannot be parsed", () => {
    // Act
    const phone = composePhone("CZ", "12");

    // Assert
    expect(phone).toBe("+42012");
  });
});

describe("splitPhone", () => {
  it("splits a stored international number back into country and national part", () => {
    // Act
    const parts = splitPhone("+420777123456", "CZ");

    // Assert
    expect(parts).toEqual({ country: "CZ", national: "777123456" });
  });

  it("recognises another country's number", () => {
    // Act
    const parts = splitPhone("+447400123456", "CZ");

    // Assert
    expect(parts).toEqual({ country: "GB", national: "7400123456" });
  });

  it("answers a shared calling code with a country the dropdown offers", () => {
    // Arrange — the library places this +44 number in Guernsey, which is not
    // in the signup list; the control could not show it.
    const guernseyRange = "+447911123456";

    // Act
    const parts = splitPhone(guernseyRange, "CZ");

    // Assert
    expect(parts).toEqual({ country: "GB", national: "7911123456" });
  });

  it("prefers the fallback country when it shares the calling code", () => {
    // Act
    const parts = splitPhone("+12025550123", "CA");

    // Assert
    expect(parts.country).toBe("US");
  });

  it("keeps an old free-text number whole, under the fallback country", () => {
    // Act
    const parts = splitPhone("777 123 456", "CZ");

    // Assert
    expect(parts).toEqual({ country: "CZ", national: "777 123 456" });
  });

  it("is empty for no number", () => {
    // Act / Assert
    expect(splitPhone(null, "CZ")).toEqual({ country: "CZ", national: "" });
  });
});

describe("withComposedPhone", () => {
  it("returns a copy whose phone is the composed number, leaving the original untouched", () => {
    // Arrange
    const form = new FormData();
    form.set("phone_country", "CZ");
    form.set("phone", "777 123 456");
    form.set("nickname", "Lukas");

    // Act
    const composed = withComposedPhone(form);

    // Assert
    expect(composed.get("phone")).toBe("+420777123456");
    expect(composed.get("nickname")).toBe("Lukas");
    expect(form.get("phone")).toBe("777 123 456");
  });

  it("leaves a form without a country field exactly as it was", () => {
    // Arrange
    const form = new FormData();
    form.set("phone", "+420777123456");

    // Act
    const composed = withComposedPhone(form);

    // Assert
    expect(composed.get("phone")).toBe("+420777123456");
  });
});

describe("formatPhone", () => {
  it("groups an international number the way its country writes it", () => {
    // Act / Assert
    expect(formatPhone("+420777123456")).toBe("+420 777 123 456");
  });

  it("shows anything it cannot parse exactly as stored", () => {
    // Act / Assert
    expect(formatPhone("777 123 456")).toBe("777 123 456");
    expect(formatPhone(null)).toBeNull();
  });
});
