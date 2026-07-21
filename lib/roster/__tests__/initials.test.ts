import { describe, expect, it } from "vitest";
import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";

describe("roster initials", () => {
  it("takes the first letter of each word, up to two", () => {
    expect(initials("Tomáš M")).toBe("TM");
    expect(initials("Jakub K")).toBe("JK");
  });

  it("keeps Czech diacritics rather than dropping the letter", () => {
    expect(initials("Ondřej Š")).toBe("OŠ");
    expect(initials("Šimon")).toBe("Š");
  });

  it("caps at two letters for a longer name", () => {
    expect(initials("Jan Novak Dvorak")).toBe("JN");
  });

  it("ignores punctuation and collapses extra spaces", () => {
    // The underscore is stripped rather than treated as a word break, so this
    // is one word and yields one letter.
    expect(initials("  petr_v  ")).toBe("P");
    expect(initials("Adam  B")).toBe("AB");
  });

  it("keeps digits, which nicknames are allowed to contain", () => {
    expect(initials("9er")).toBe("9");
  });

  it("falls back for a nickname with nothing renderable", () => {
    expect(initials("***")).toBe(strings.games.rosterUnknown);
    expect(initials("")).toBe(strings.games.rosterUnknown);
  });
});
