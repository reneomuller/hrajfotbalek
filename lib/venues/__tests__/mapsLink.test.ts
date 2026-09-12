import { describe, expect, it, vi } from "vitest";
import {
  isMapsUrl,
  parseCoordinatePair,
  isShortMapsUrl,
  parseMapsUrl,
  resolveMapsShareLink,
  toMapQuery,
} from "@/lib/venues/mapsLink";

/**
 * ROUND 30, ITEM 4 — the Google Maps share link.
 *
 * THE URLS BELOW ARE THE REAL SHAPES the share sheet produces, not invented
 * ones: the short `maps.app.goo.gl` key that "Copy link" gives, and the long
 * `/maps/place/…/@lat,lng,zoom/data=…!3d…!4d…` the browser shows.
 */

const LONG =
  "https://www.google.com/maps/place/Pra%C5%BEa%C4%8Dka/@50.0874,14.4682,17z/" +
  "data=!3m1!4b1!4m6!3m5!1s0x470b94:0x1234!8m2!3d50.0871!4d14.4695!16s%2Fg%2F1";

describe("isMapsUrl", () => {
  it("accepts both share shapes", () => {
    expect(isMapsUrl("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isMapsUrl(LONG)).toBe(true);
  });

  it("rejects a plain place name, which is what the field used to take", () => {
    expect(isMapsUrl("Praha 3 Pražačka")).toBe(false);
  });

  it("REFUSES A HOST THAT IS NOT GOOGLE'S — the SSRF boundary", () => {
    /*
     * This input becomes a server-side HTTP request. An allow-list is the only
     * safe shape: a block-list that forgot the cloud metadata endpoint would
     * be worth nothing.
     */
    for (const hostile of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:54322/",
      "https://evil.example.com/maps/place/x/@1,2",
      "file:///etc/passwd",
      "https://maps.app.goo.gl.evil.com/abc",
    ]) {
      expect(isMapsUrl(hostile), `${hostile} was allowed`).toBe(false);
    }
  });
});

describe("isShortMapsUrl", () => {
  it("knows which shape needs the network", () => {
    expect(isShortMapsUrl("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapsUrl(LONG)).toBe(false);
  });
});

describe("parseMapsUrl", () => {
  it("prefers the PIN over the viewport", () => {
    /*
     * `!3d/!4d` is the place; `/@` is where the camera happened to be. A link
     * shared after panning has a viewport that is not the pitch, so the pin
     * must win — asserted here because both are present in the same URL and
     * they differ.
     */
    expect(parseMapsUrl(LONG)).toEqual({ lat: 50.0871, lng: 14.4695 });
  });

  it("reads an explicit q= pair", () => {
    expect(parseMapsUrl("https://www.google.com/maps?q=50.0755,14.4378")).toEqual({
      lat: 50.0755,
      lng: 14.4378,
    });
  });

  it("falls back to the viewport when there is no pin", () => {
    expect(parseMapsUrl("https://www.google.com/maps/@50.09,14.41,15z")).toEqual({
      lat: 50.09,
      lng: 14.41,
    });
  });

  it("falls back to the place NAME when there are no coordinates at all", () => {
    expect(
      parseMapsUrl("https://www.google.com/maps/place/Sportovn%C3%AD+hala+Pra%C5%BEa%C4%8Dka"),
    ).toEqual({ place: "Sportovní hala Pražačka" });
  });

  it("refuses 0,0 — the Gulf of Guinea is what a failed parse looks like", () => {
    expect(parseMapsUrl("https://www.google.com/maps?q=0,0")).toBeNull();
  });

  it("refuses out-of-range coordinates", () => {
    expect(parseMapsUrl("https://www.google.com/maps?q=91.5,14.4")).toBeNull();
    expect(parseMapsUrl("https://www.google.com/maps?q=50.1,181.2")).toBeNull();
  });

  it("returns null for junk rather than guessing", () => {
    expect(parseMapsUrl("not a url")).toBeNull();
  });
});

describe("toMapQuery", () => {
  it("renders a coordinate pair Maps can search for", () => {
    expect(toMapQuery({ lat: 50.087123456, lng: 14.469512345 })).toBe("50.087123,14.469512");
  });

  it("passes a place name through unchanged", () => {
    expect(toMapQuery({ place: "Pražačka" })).toBe("Pražačka");
  });
});

describe("resolveMapsShareLink", () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } });

  it("expands a short link and reads the pin out of the destination", async () => {
    // Arrange
    const fetchImpl = vi.fn().mockResolvedValue(redirectTo(LONG));

    // Act
    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    // Assert
    expect(out).toEqual({ ok: true, mapQuery: "50.0871,14.4695", from: "coordinates" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves a LONG link without touching the network at all", async () => {
    // Arrange
    const fetchImpl = vi.fn();

    // Act
    const out = await resolveMapsShareLink(LONG, fetchImpl as never);

    // Assert
    expect(out).toEqual({ ok: true, mapQuery: "50.0871,14.4695", from: "coordinates" });
    expect(fetchImpl, "a long link should need no round trip").not.toHaveBeenCalled();
  });

  it("refuses a redirect that leaves Google, even from an allowed start", async () => {
    /*
     * THE HOP IS RE-CHECKED, not just the input. A permitted host is free to
     * redirect somewhere that is not, and `redirect: "follow"` would chase it
     * with no say — which is why this uses manual redirects.
     */
    const fetchImpl = vi.fn().mockResolvedValue(redirectTo("http://169.254.169.254/"));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: false, reason: "unparseable" });
  });

  it("says UNREACHABLE when the network fails, rather than guessing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out"));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: false, reason: "unreachable" });
  });

  it("says NOT-A-LINK for a plain place name, so search still works", async () => {
    const fetchImpl = vi.fn();

    const out = await resolveMapsShareLink("Praha 3 Pražačka", fetchImpl as never);

    expect(out).toEqual({ ok: false, reason: "not-a-link" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the destination out of an HTML interstitial when there is no 302", async () => {
    /*
     * THE SHAPE THE LIVE SERVICE ACTUALLY RETURNS. Checked against
     * `maps.app.goo.gl` rather than assumed: it answered 200 with no
     * `location` header and 34 KB of HTML. The first draft of this resolver
     * broke exactly here and would have failed the owner a fourth time on the
     * one link shape he uses.
     */
    const html = `<!doctype html><html><head>
      <link rel="canonical" href="${LONG.replace(/&/g, "&amp;")}">
      </head><body>redirecting</body></html>`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: true, mapQuery: "50.0871,14.4695", from: "coordinates" });
  });

  it("prefers a meta refresh over a canonical", async () => {
    const html = `<html><head>
      <meta http-equiv="refresh" content="0;url=${LONG.replace(/&/g, "&amp;")}">
      <link rel="canonical" href="https://maps.app.goo.gl/AbCdEf123">
      </head></html>`;
    const fetchImpl = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: true, mapQuery: "50.0871,14.4695", from: "coordinates" });
  });

  it("does not loop on Google's invalid-link page, which canonicalises to itself", async () => {
    /*
     * VERIFIED AGAINST THE LIVE SERVICE with a made-up key: the "not found"
     * page's canonical is the short URL you just asked for. Following it would
     * spin until the hop limit for no reason.
     */
    const html =
      '<html><head><link rel="canonical" href="https://maps.app.goo.gl/AbCdEf123"></head></html>';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: false, reason: "unparseable" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than looping when a link redirects for ever", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(redirectTo("https://maps.app.goo.gl/again"));

    const out = await resolveMapsShareLink("https://maps.app.goo.gl/AbCdEf123", fetchImpl as never);

    expect(out).toEqual({ ok: false, reason: "unparseable" });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

/*
 * ROUND 30, ITEM 6 — a pasted coordinate pair.
 *
 * This is what Google Maps puts on the clipboard on a long-press or a
 * right-click, and it is the most precise input the field can receive. No
 * network, no ambiguity — but the DETECTION has to be strict, because the near
 * miss is a real address.
 */
describe("parseCoordinatePair", () => {
  it("accepts the shape Maps copies, with and without the space", () => {
    expect(parseCoordinatePair("50.0755, 14.4378")).toEqual({ lat: 50.0755, lng: 14.4378 });
    expect(parseCoordinatePair("50.0755,14.4378")).toEqual({ lat: 50.0755, lng: 14.4378 });
    expect(parseCoordinatePair("  50.0755 , 14.4378  ")).toEqual({ lat: 50.0755, lng: 14.4378 });
  });

  it("accepts a southern or western hemisphere", () => {
    /*
     * Prague is positive/positive, and hard-coding that is the kind of thing
     * that works until the first fixture abroad.
     */
    expect(parseCoordinatePair("-33.8688, 151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(parseCoordinatePair("51.5074, -0.1278")).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it("REFUSES A POSTCODE-SHAPED PLACE NAME — the reason a decimal point is required", () => {
    /*
     * `Praha 3, 130 00` is two comma-separated numbers too. A looser pattern
     * would silently turn an address into a pin in the Atlantic, which is
     * exactly the class of failure this field already had once.
     */
    for (const name of ["Praha 3, 130 00", "50, 14", "Sportovní hala, 3", "1,2"]) {
      expect(parseCoordinatePair(name), `${name} was read as coordinates`).toBeNull();
    }
  });

  it("refuses out-of-range and null-island pairs, like the URL parser does", () => {
    expect(parseCoordinatePair("91.5000, 14.4378")).toBeNull();
    expect(parseCoordinatePair("50.0755, 181.0001")).toBeNull();
    expect(parseCoordinatePair("0.0, 0.0")).toBeNull();
  });

  it("refuses a place name and a URL, which take the other two paths", () => {
    expect(parseCoordinatePair("Praha 3 Pražačka")).toBeNull();
    expect(parseCoordinatePair("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
  });

  it("round-trips through toMapQuery into what a resolved link stores", () => {
    // One stored format, whichever way the location arrived.
    const pair = parseCoordinatePair("50.0755, 14.4378")!;
    expect(toMapQuery(pair)).toBe("50.0755,14.4378");
  });
});
