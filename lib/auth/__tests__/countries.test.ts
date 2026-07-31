import { describe, expect, it } from "vitest";
import {
  COUNTRY_CODES,
  countryFlag,
  countryOptions,
  isCountryCodeShape,
  isKnownCountry,
  normaliseCountry,
} from "@/lib/auth/countries";

describe("the code list", () => {
  it("is every entry a well-formed alpha-2 code", () => {
    const malformed = COUNTRY_CODES.filter((c) => !isCountryCodeShape(c));
    expect(malformed).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });

  it("covers the countries this product actually serves", () => {
    // Prague pickup football: the organiser is Czech, the players are not
    // uniformly so. These four are the ones whose absence would be noticed on
    // day one.
    for (const code of ["CZ", "SK", "UA", "RU"]) {
      expect(COUNTRY_CODES).toContain(code);
    }
  });

  it("is long enough to be a real list rather than a shortlist", () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(190);
  });
});

describe("isKnownCountry", () => {
  it("accepts a code from the list, in any case, with padding", () => {
    expect(isKnownCountry("CZ")).toBe(true);
    expect(isKnownCountry("cz")).toBe(true);
    expect(isKnownCountry("  cz  ")).toBe(true);
  });

  it("rejects a well-shaped code that is not a country", () => {
    // The database CHECK only knows shape. `ZZ` passes that and is not a place.
    expect(isCountryCodeShape("ZZ")).toBe(true);
    expect(isKnownCountry("ZZ")).toBe(false);
  });

  it("rejects nothing-shaped input", () => {
    expect(isKnownCountry("")).toBe(false);
    expect(isKnownCountry("CZE")).toBe(false);
    expect(isKnownCountry(null)).toBe(false);
    expect(isKnownCountry(undefined)).toBe(false);
  });
});

describe("normaliseCountry", () => {
  it("returns the stored shape for anything recognisable", () => {
    expect(normaliseCountry(" sk ")).toBe("SK");
  });

  it("returns null rather than a guess", () => {
    expect(normaliseCountry("ZZ")).toBeNull();
    expect(normaliseCountry("Czechia")).toBeNull();
  });
});

describe("countryFlag", () => {
  it("builds the flag from the code's letters", () => {
    // Two regional indicator symbols: 🇨🇿
    expect(countryFlag("CZ")).toBe("\u{1F1E8}\u{1F1FF}");
  });

  it("returns nothing for a malformed code rather than mojibake", () => {
    expect(countryFlag("cz")).toBe("");
    expect(countryFlag("CZE")).toBe("");
  });
});

describe("countryOptions", () => {
  it("names countries in the requested locale", () => {
    expect(countryOptions("en").find((c) => c.code === "CZ")?.name).toMatch(/Czech/);
    const cs = countryOptions("cs").find((c) => c.code === "DE")?.name;
    // Germany is "Německo" in Czech — proof the names come from ICU rather than
    // from an English table we would otherwise have to translate 249 times.
    expect(cs).not.toMatch(/^Germany$/);
  });

  it("sorts by name in that locale, not by code", () => {
    const names = countryOptions("en").map((c) => c.name);
    const sorted = [...names].sort(new Intl.Collator("en").compare);
    expect(names).toEqual(sorted);
  });

  it("gives every option a code and a flag", () => {
    for (const option of countryOptions("en")) {
      expect(option.code).toMatch(/^[A-Z]{2}$/);
      expect(option.flag.length).toBeGreaterThan(0);
      expect(option.name.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the code when a locale is unusable", () => {
    // An unknown locale must still produce a usable list: a signup form with no
    // countries in it is worse than one with terse labels.
    const options = countryOptions("not-a-locale");
    expect(options.length).toBe(COUNTRY_CODES.length);
  });
});
