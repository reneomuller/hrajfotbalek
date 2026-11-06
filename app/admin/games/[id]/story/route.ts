import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildGameStory } from "@/lib/og/gameStory";

/**
 * A game's 9:16 story image, as a download (2026-11-06, the owner: "while
 * creating a game or from the game card itself, admins could download an image
 * in 9:16 (1080x1920) of the game").
 *
 * ADMIN ONLY, and the guard is the same one every admin page uses: a signed-out
 * visitor is sent to sign in and a player to the home page, learning nothing
 * about whether the game exists. Drawn per request — the player count is the
 * one fact that moves.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const story = await buildGameStory(id);
  if (!story) return new Response(null, { status: 404 });

  return new Response(story.image.body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${story.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
