import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  avatarUrl,
  extensionForMimeType,
  rejectPhoto,
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

  it("rejects anything over the bucket's own limit", () => {
    expect(rejectPhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1 })).toEqual({
      reason: "size",
    });
    // Exactly at the limit is fine: the bucket compares the same way.
    expect(rejectPhoto({ type: "image/png", size: MAX_PHOTO_BYTES })).toBeNull();
  });

  it("checks the type before the size, so the message names the real problem", () => {
    expect(rejectPhoto({ type: "application/pdf", size: MAX_PHOTO_BYTES * 10 })).toEqual({
      reason: "type",
    });
  });
});
