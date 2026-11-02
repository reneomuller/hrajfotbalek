import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileMeta } from "@/components/account/ProfileMeta";
import { strings } from "@/lib/strings";

/**
 * The line under the nickname on your own profile: flag, country, join date
 * (2026-11-02). The public profile has carried the flag since round 28; your
 * own page printed the country's name alone.
 */
describe("ProfileMeta", () => {
  it("puts the country's flag in front of its name", () => {
    // Arrange
    const props = { country: "IR", createdAt: "2026-08-01T10:00:00Z", locale: "en" as const };

    // Act
    const html = renderToStaticMarkup(<ProfileMeta {...props} t={strings} />);

    // Assert
    expect(html).toContain('data-country="IR"');
    expect(html).toContain('src="/flags/3x2/IR.svg"');
    expect(html.indexOf('data-testid="country-flag"')).toBeLessThan(html.indexOf("Iran"));
    expect(html).toMatch(/Iran · since Aug 2026/);
  });

  it("draws no flag when the player has not set a country", () => {
    // Arrange
    const props = { country: null, createdAt: "2026-08-01T10:00:00Z", locale: "en" as const };

    // Act
    const html = renderToStaticMarkup(<ProfileMeta {...props} t={strings} />);

    // Assert
    expect(html).not.toContain("country-flag");
    expect(html).toContain("since Aug 2026");
  });

  it("renders nothing when there is neither a country nor a readable date", () => {
    // Arrange
    const props = { country: null, createdAt: "not a date", locale: "en" as const };

    // Act
    const html = renderToStaticMarkup(<ProfileMeta {...props} t={strings} />);

    // Assert
    expect(html).toBe("");
  });
});
