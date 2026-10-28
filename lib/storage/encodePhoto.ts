/**
 * THE CROP, SHRUNK TO FIT (owner, 2026-10-28): "don't allow sizes that'd slow
 * things down or overwhelm. instead, you can reduce the quality of the profile
 * pic to match the size we want."
 *
 * Pure, so it can be tested without a canvas: the caller hands in an encoder
 * (`canvas.toBlob` in the browser) and a byte budget, and gets back the best
 * quality that fits.
 *
 * WEBP, ELSE JPEG — NEVER PNG. A browser that cannot WRITE a type answers the
 * request with PNG instead, silently; Safari does exactly that for WebP. A PNG
 * of a photograph is several times the size, and a cover at 1200x1049 came out
 * over the bucket's 2 MB — an upload refused after the player had framed it.
 * So a produced type that is not the one asked for means "try the next type".
 */
export type PhotoEncoder = (type: string, quality: number) => Promise<Blob | null>;

export const PHOTO_ENCODINGS = ["image/webp", "image/jpeg"] as const;

/** Highest first; the first that fits wins. */
export const PHOTO_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5] as const;

export async function encodeWithinBudget(encode: PhotoEncoder, budgetBytes: number): Promise<Blob> {
  for (const type of PHOTO_ENCODINGS) {
    let smallest: Blob | null = null;
    for (const quality of PHOTO_QUALITIES) {
      const blob = await encode(type, quality);
      // This browser cannot write the type: the next one, not a PNG.
      if (!blob || blob.type !== type) break;
      if (blob.size <= budgetBytes) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
    // The type works but nothing fit: its smallest is still far under the
    // bucket's limit for any crop this product makes.
    if (smallest) return smallest;
  }
  throw new Error("encode failed");
}
