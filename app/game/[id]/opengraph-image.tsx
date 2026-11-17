import { buildGameShareJpeg } from "@/lib/og/gameShare";
import { OG_SIZE, SHARE_CONTENT_TYPE } from "@/lib/og/shareImage";
import { strings } from "@/lib/strings";

export const size = OG_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = strings.meta.title;

// Spots-left is on the card, so it is rendered per request rather than cached.
export const dynamic = "force-dynamic";

/**
 * The game's link preview: the 9:16 story laid on its side (2026-11-17) — see
 * `lib/og/shareImage.tsx`. A JPEG rather than the PNG `ImageResponse` makes,
 * because it carries the venue's photograph and WhatsApp drops a heavy image.
 */
export default async function GameOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jpeg = await buildGameShareJpeg(id);
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": SHARE_CONTENT_TYPE } });
}
