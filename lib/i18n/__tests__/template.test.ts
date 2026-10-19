import { describe, expect, it } from "vitest";
import { fillTemplate, splitTemplate } from "@/lib/i18n/template";

describe("splitTemplate", () => {
  it("splits a sentence around its named slots, in order", () => {
    // Arrange
    const template = "I have read the {terms} and the {rules}.";

    // Act
    const parts = splitTemplate(template);

    // Assert
    expect(parts).toEqual([
      { kind: "text", text: "I have read the ", at: 0 },
      { kind: "slot", name: "terms", at: 16 },
      { kind: "text", text: " and the ", at: 23 },
      { kind: "slot", name: "rules", at: 32 },
      { kind: "text", text: ".", at: 39 },
    ]);
  });

  it("returns the whole string as text when there is no slot", () => {
    // Arrange
    const template = "Nothing to fill.";

    // Act
    const parts = splitTemplate(template);

    // Assert
    expect(parts).toEqual([{ kind: "text", text: "Nothing to fill.", at: 0 }]);
  });
});

describe("fillTemplate", () => {
  it("replaces every slot with its value, so the stored consent reads as shown", () => {
    // Arrange
    const template = "{a} and {b}, then {a} again";

    // Act
    const filled = fillTemplate(template, { a: "Terms", b: "Rules" });

    // Assert
    expect(filled).toBe("Terms and Rules, then Terms again");
  });

  it("leaves an unknown slot visible rather than silently dropping words", () => {
    // Arrange
    const template = "Pay {amount} by {date}";

    // Act
    const filled = fillTemplate(template, { amount: "180,- Kč" });

    // Assert
    expect(filled).toBe("Pay 180,- Kč by {date}");
  });
});
