import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountryWithFlag } from "@/components/flags/CountryWithFlag";
import { FLAG_CIRCLE_PX } from "@/components/flags/CountryFlag";

/**
 * The country under a player's name on their public profile (2026-11-02, the
 * owner: "opening a player's profile, users can see their country with the
 * flag too") — the same line your own profile now carries, minus the join date.
 */
describe("CountryWithFlag", () => {
  it("draws the flag in front of the country's name, in the reader's language", () => {
    // Act
    const html = renderToStaticMarkup(<CountryWithFlag country="SI" locale="cs" />);

    // Assert
    expect(html).toContain('data-country="SI"');
    expect(html).toContain(`width:${FLAG_CIRCLE_PX.compact}px`);
    expect(html.indexOf('data-testid="country-flag"')).toBeLessThan(html.indexOf("Slovinsko"));
  });

  it("draws the Lion and Sun for Iran", () => {
    const html = renderToStaticMarkup(<CountryWithFlag country="IR" locale="en" />);

    expect(html).toContain('src="/flags/3x2/IR.svg"');
    expect(html).toContain("Iran");
  });

  it("renders nothing for a player who has not set a country", () => {
    expect(renderToStaticMarkup(<CountryWithFlag country={null} locale="en" />)).toBe("");
  });
});
