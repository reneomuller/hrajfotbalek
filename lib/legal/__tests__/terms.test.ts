import { describe, expect, it } from "vitest";
import { TERMS_FIELD, acceptedTerms } from "@/lib/legal/terms";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("acceptedTerms", () => {
  it("accepts a ticked checkbox", () => {
    // Arrange — a native checkbox posts "on" when ticked and nothing otherwise.
    const data = form({ [TERMS_FIELD]: "on" });

    // Act / Assert
    expect(acceptedTerms(data)).toBe(true);
  });

  it("refuses a form that does not carry the field", () => {
    // Arrange — an unticked box, or a hand-made POST that leaves it out.
    const data = form({ gameId: "g1" });

    // Act / Assert
    expect(acceptedTerms(data)).toBe(false);
  });

  it("refuses an empty or unexpected value", () => {
    // Arrange / Act / Assert — only the checkbox's own value counts as consent.
    expect(acceptedTerms(form({ [TERMS_FIELD]: "" }))).toBe(false);
    expect(acceptedTerms(form({ [TERMS_FIELD]: "false" }))).toBe(false);
  });
});
