import { describe, expect, it } from "vitest";
import { encodeWithinBudget, PHOTO_QUALITIES, type PhotoEncoder } from "@/lib/storage/encodePhoto";

/**
 * Owner, 2026-10-28: "don't allow sizes that'd slow things down or overwhelm.
 * instead, you can reduce the quality of the profile pic to match the size we
 * want." The crop is re-encoded at falling quality until it fits.
 */

/** A fake canvas: `sizes[type]` is the byte count at quality 1, scaled by quality. */
function encoder(sizes: Record<string, number>, answersAs: Record<string, string> = {}): {
  encode: PhotoEncoder;
  calls: string[];
} {
  const calls: string[] = [];
  const encode: PhotoEncoder = async (type, quality) => {
    calls.push(`${type}@${quality}`);
    const produced = answersAs[type] ?? type;
    const full = sizes[produced];
    if (full === undefined) return null;
    return new Blob([new Uint8Array(Math.round(full * quality))], { type: produced });
  };
  return { encode, calls };
}

describe("encodeWithinBudget", () => {
  it("keeps the best quality that fits", async () => {
    // Arrange
    const { encode } = encoder({ "image/webp": 1000 });

    // Act
    const blob = await encodeWithinBudget(encode, 950);

    // Assert
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(900);
  });

  it("lowers the quality step by step until the photo fits", async () => {
    // Arrange
    const { encode, calls } = encoder({ "image/webp": 1000 });

    // Act
    const blob = await encodeWithinBudget(encode, 650);

    // Assert
    expect(blob.size).toBe(600);
    expect(calls).toEqual(["image/webp@0.9", "image/webp@0.8", "image/webp@0.7", "image/webp@0.6"]);
  });

  it("writes JPEG where the browser cannot write WebP, never the PNG it falls back to", async () => {
    // Arrange — Safari answers a WebP request with a PNG.
    const { encode } = encoder({ "image/png": 5000, "image/jpeg": 1000 }, { "image/webp": "image/png" });

    // Act
    const blob = await encodeWithinBudget(encode, 950);

    // Assert
    expect(blob.type).toBe("image/jpeg");
  });

  it("returns the smallest it could make when even the lowest quality is over", async () => {
    // Arrange
    const { encode } = encoder({ "image/webp": 1000 });

    // Act
    const blob = await encodeWithinBudget(encode, 10);

    // Assert
    expect(blob.size).toBe(Math.round(1000 * PHOTO_QUALITIES[PHOTO_QUALITIES.length - 1]!));
  });

  it("fails loudly when the browser can write neither type", async () => {
    // Arrange
    const { encode } = encoder({});

    // Act / Assert
    await expect(encodeWithinBudget(encode, 1000)).rejects.toThrow("encode failed");
  });
});
