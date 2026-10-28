import { describe, expect, it } from "vitest";
import {
  MAX_PICKED_PHOTO_BYTES,
  avatarUrl,
  extensionForMimeType,
  rejectPhoto,
  venuePhotoUrl,
} from "@/lib/storage/avatar";

const SUPABASE = "http://127.0.0.1:54321";
const PATH = "players/bbbb0000-0000-0000-0000-0000000fb002.webp";

describe("extensionForMimeType", () => {
  it("maps the three the bucket accepts", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/webp")).toBe("webp");
  });

  it("refuses SVG, which is a script container browsers render", () => {
    expect(extensionForMimeType("image/svg+xml")).toBeNull();
  });

  it("refuses anything else rather than guessing an extension", () => {
    expect(extensionForMimeType("image/gif")).toBeNull();
    expect(extensionForMimeType("application/pdf")).toBeNull();
    expect(extensionForMimeType("")).toBeNull();
  });
});

describe("avatarUrl", () => {
  it("returns null when there is no photo, so callers fall back to initials", () => {
    expect(avatarUrl(SUPABASE, null)).toBeNull();
    expect(avatarUrl(SUPABASE, undefined)).toBeNull();
    expect(avatarUrl(SUPABASE, "")).toBeNull();
  });

  it("builds the public object URL", () => {
    expect(avatarUrl(SUPABASE, PATH)).toBe(
      `${SUPABASE}/storage/v1/object/public/profile-photos/${PATH}`,
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(avatarUrl(`${SUPABASE}/`, PATH)).toBe(
      `${SUPABASE}/storage/v1/object/public/profile-photos/${PATH}`,
    );
  });

  it("busts the cache when the row changed", () => {
    // The key never changes — it is derived from the player id — so without
    // this a re-upload shows the old face and reads as a failed upload.
    const url = avatarUrl(SUPABASE, PATH, "2026-08-01T10:00:00Z");
    expect(url).toContain("?v=");
    expect(url).not.toBe(avatarUrl(SUPABASE, PATH, "2026-08-02T10:00:00Z"));
  });
});

describe("rejectPhoto", () => {
  it("accepts an ordinary photo", () => {
    expect(rejectPhoto({ type: "image/jpeg", size: 500_000 })).toBeNull();
  });

  it("rejects an unsupported type", () => {
    expect(rejectPhoto({ type: "image/svg+xml", size: 1000 })).toEqual({ reason: "type" });
  });

  /*
   * Owner, 2026-10-28: "i can't select many of my photos. only like 1 in 5 it
   * registers". The picker compared the ORIGINAL against the bucket's 2 MB —
   * but the original never leaves the phone; the crop does, at a few hundred
   * kilobytes. An ordinary phone photo is 2–6 MB, so most were refused.
   */
  it("accepts an ordinary phone photo of several megabytes", () => {
    expect(rejectPhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBeNull();
  });

  it("refuses only a file too large to decode safely on a phone", () => {
    expect(rejectPhoto({ type: "image/jpeg", size: MAX_PICKED_PHOTO_BYTES + 1 })).toEqual({
      reason: "size",
    });
    expect(rejectPhoto({ type: "image/jpeg", size: MAX_PICKED_PHOTO_BYTES })).toBeNull();
  });

  it("checks the type before the size, so the message names the real problem", () => {
    expect(rejectPhoto({ type: "application/pdf", size: MAX_PICKED_PHOTO_BYTES * 10 })).toEqual({
      reason: "type",
    });
  });
});

/**
 * ROUND 41 — "venue picture doesn't update when changing it". A replaced photo
 * lands at the same key, and the optimizer keeps an image for a year, so the
 * URL itself has to move when the bytes do.
 */
describe("venuePhotoUrl", () => {
  const KEY = "venues/2af42ddb-8c93-49a2-b9cd-18d128dbb3f3.webp";

  it("carries the object's version, so a replacement is a new URL", () => {
    // Act
    const before = venuePhotoUrl(SUPABASE, KEY, "2026-10-27T15:21:06.249Z");
    const after = venuePhotoUrl(SUPABASE, KEY, "2026-10-27T16:57:39.779Z");

    // Assert
    expect(before).toContain("?v=");
    expect(after).not.toBe(before);
  });

  it("leaves the URL bare when no version is known", () => {
    // Act
    const url = venuePhotoUrl(SUPABASE, KEY, null);

    // Assert
    expect(url).toBe(`${SUPABASE}/storage/v1/object/public/venue-photos/${KEY}`);
  });

  it("never versions a committed repo asset, whose URL moves with the deploy", () => {
    // Act
    const url = venuePhotoUrl(SUPABASE, "/venues/korab.jpg", "2026-10-27T16:57:39.779Z");

    // Assert
    expect(url).toBe("/venues/korab.jpg");
  });
});
