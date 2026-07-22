import { describe, expect, it } from "vitest";
import { whatsAppShareUrl } from "@/lib/games/share";

/** The share text, decoded back out of the wa.me URL. */
function decoded(url: string): string {
  return decodeURIComponent(url.replace("https://wa.me/?text=", ""));
}

describe("whatsAppShareUrl", () => {
  it("builds a wa.me link carrying venue, time and URL", () => {
    const url = whatsAppShareUrl({
      venue: "Pražačka",
      when: "Sun 27 Jul · 19:00",
      url: "https://hrajfotbal.com/game/abc",
    });

    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decoded(url)).toContain("Pražačka");
    expect(decoded(url)).toContain("Sun 27 Jul · 19:00");
    expect(decoded(url)).toContain("https://hrajfotbal.com/game/abc");
  });

  /*
   * The whole reason this is a function rather than a template at three call
   * sites. A venue name routinely contains `&`, and the seed carries a fixture
   * with tags, quotes and a backslash on purpose. Encoded once over the
   * finished message, all of it survives; assembled from separately-encoded
   * fragments, either the safe parts double-encode or the dangerous ones stay
   * raw and truncate the message at the first `&`.
   */
  it("survives a venue name full of URL metacharacters", () => {
    const venue = '<script>alert(1)</script> "Praha 2", a;b\\c & more?x=1#y';
    const url = whatsAppShareUrl({
      venue,
      when: "Sat 1 Aug · 20:00",
      url: "https://hrajfotbal.com/game/xyz",
    });

    expect(decoded(url)).toContain(venue);
    // The game URL is still intact and still last — an unencoded `&` or `#` in
    // the venue would have swallowed everything after it.
    expect(decoded(url).endsWith("https://hrajfotbal.com/game/xyz")).toBe(true);
  });

  it("encodes exactly once — no double-escaped percent signs", () => {
    const url = whatsAppShareUrl({
      venue: "Praha 100%",
      when: "Sun 2 Aug · 18:00",
      url: "https://hrajfotbal.com/game/pct",
    });

    expect(decoded(url)).toContain("Praha 100%");
    expect(url).not.toContain("%2525");
  });

  it("keeps the newline the template asks for, encoded rather than dropped", () => {
    const url = whatsAppShareUrl({
      venue: "Letná",
      when: "Mon 3 Aug · 19:30",
      url: "https://hrajfotbal.com/game/l",
    });

    expect(url).toContain("%0A");
    expect(decoded(url)).toContain("\n");
  });
});
