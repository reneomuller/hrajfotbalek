import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import { venuePhotoVersion } from "@/lib/storage/photoVersions";

/**
 * A venue's photo as a JPEG data URI at exactly the size a game image draws it,
 * or null — then the renderer draws pitch lines. Used by the 9:16 story and by
 * the link preview.
 *
 * The renderer cannot decode WebP, which is what the uploader stores, so every
 * photo goes through sharp; and it is fetched at the size it is drawn, no
 * larger. A photo that cannot be fetched is an image without a photo, not a
 * failed image.
 */
export async function venuePhotoDataUri(
  imagePath: string | null,
  size: { width: number; height: number },
): Promise<string | null> {
  if (!imagePath) return null;
  const url = venuePhotoUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    imagePath,
    await venuePhotoVersion(imagePath),
  );
  if (!url) return null;

  try {
    // A repo asset (`/venues/x.jpg`) is on disk beside the code; a bucket key is a URL.
    const source = url.startsWith("/")
      ? readFileSync(join(process.cwd(), "public", url))
      : Buffer.from(await (await fetch(url)).arrayBuffer());
    const jpeg = await sharp(source)
      .resize({ ...size, fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    // Unreachable storage or an unreadable file: the pitch-lines fallback is
    // the honest picture of "no photo", and the rest of the image still holds.
    return null;
  }
}
