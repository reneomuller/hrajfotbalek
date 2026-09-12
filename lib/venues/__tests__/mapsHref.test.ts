import { describe, expect, it } from "vitest";
import { venueAddressLine, venueMapsHref } from "@/lib/venues/mapsHref";

/**
 * ROUND 31, ITEM 1 — what the player's map button opens, and what the page
 * calls the place.
 *
 * THE DEFECT THESE PIN DOWN: round 30 stored coordinates, the pin landed
 * exactly right, and Google then opened labelled `50.092534,14.475315`. A
 * correct pin under a number is still a product that looks broken.
 */

const SHARE = "https://maps.app.goo.gl/AbCdEf123";

describe("venueMapsHref", () => {
  it("(a) opens the admin's own share link when there is one", () => {
    /*
     * VERBATIM, not rebuilt. Google's place card for that exact place has the
     * name, the photographs and the entrance; nothing this product assembles
     * beats it.
     */
    const href = venueMapsHref({
      name: "Praha 10 • Strašnice",
      mapQuery: "50.092534,14.475315",
      mapUrl: SHARE,
    });
    expect(href).toBe(SHARE);
  });

  it("(b) searches for the NAME at the coordinates, name first", () => {
    // Arrange / Act
    const href = venueMapsHref({
      name: "Praha 10 • Strašnice",
      mapQuery: "50.092534,14.475315",
      mapUrl: null,
    });

    // Assert — one query carrying both, and the name leads.
    const query = decodeURIComponent(new URL(href).searchParams.get("query") ?? "");
    expect(query).toBe("Praha 10 • Strašnice 50.092534,14.475315");
    expect(href.startsWith("https://www.google.com/maps/search/?api=1")).toBe(true);
  });

  it("(b) puts the name BEFORE the coordinates, which is what makes Google label it", () => {
    /*
     * Coordinates first inverts the behaviour: the pin wins and the name is
     * ignored, which is precisely the screen this item exists to remove.
     */
    const href = venueMapsHref({
      name: "Pražačka",
      mapQuery: "50.0871,14.4695",
      mapUrl: null,
    });
    const query = decodeURIComponent(new URL(href).searchParams.get("query") ?? "");
    expect(query.indexOf("Pražačka")).toBeLessThan(query.indexOf("50.0871"));
  });

  it("(c) leaves an address or a place name exactly as it was", () => {
    const href = venueMapsHref({
      name: "Praha 3 • Pražačka",
      mapQuery: "Nad Ohradou 2825/23, 130 00 Praha 3-Žižkov",
      mapUrl: null,
    });
    const query = decodeURIComponent(new URL(href).searchParams.get("query") ?? "");
    expect(query).toBe("Nad Ohradou 2825/23, 130 00 Praha 3-Žižkov");
  });

  it("falls back to the venue's own name when nothing was entered", () => {
    const href = venueMapsHref({ name: "Praha 7 • Letná", mapQuery: null, mapUrl: null });
    const query = decodeURIComponent(new URL(href).searchParams.get("query") ?? "");
    expect(query).toBe("Praha 7 • Letná");
  });

  it("NEVER opens a bare coordinate label when a name exists", () => {
    /*
     * THE RULE, ASSERTED DIRECTLY rather than left implied by the cases above.
     * Whatever the venue holds, the outbound query must mention the venue by
     * name unless the admin deliberately typed something else.
     */
    for (const mapQuery of ["50.092534,14.475315", "50.0755, 14.4378", null]) {
      const href = venueMapsHref({ name: "Letná", mapQuery, mapUrl: null });
      const query = decodeURIComponent(new URL(href).searchParams.get("query") ?? "");
      expect(query, `bare coordinates leaked for ${String(mapQuery)}`).toContain("Letná");
    }
  });
});

describe("venueAddressLine", () => {
  it("prints an address", () => {
    expect(
      venueAddressLine({ name: "Praha 3 • Pražačka", mapQuery: "Nad Ohradou 2825/23" }),
    ).toBe("Nad Ohradou 2825/23");
  });

  it("prints NOTHING for coordinates — the pin is on the button", () => {
    expect(venueAddressLine({ name: "Strašnice", mapQuery: "50.092534,14.475315" })).toBeNull();
  });

  it("prints NOTHING for a URL, which two production rows held", () => {
    /*
     * Before round 31 this component printed whatever was in `map_query`, so
     * two venues showed `https://maps.app.goo.gl/…` to players as their
     * street address.
     */
    expect(venueAddressLine({ name: "Bang cock", mapQuery: SHARE })).toBeNull();
  });

  it("does not print the venue's own name back at it", () => {
    expect(venueAddressLine({ name: "Prazacka Football", mapQuery: "Prazacka Football" })).toBeNull();
  });

  it("prints nothing when there is nothing", () => {
    expect(venueAddressLine({ name: "Letná", mapQuery: null })).toBeNull();
    expect(venueAddressLine({ name: "Letná", mapQuery: "   " })).toBeNull();
  });
});
