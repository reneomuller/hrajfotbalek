import { redirect } from "next/navigation";

/**
 * `/admin/games/[id]/edit` — merged into the game surface in Phase 18
 * (§7, REQ-ADMIN-003).
 *
 * KEPT AS A REDIRECT RATHER THAN DELETED. The route was linked from the games
 * list, typed from memory by the one person who uses this panel, and navigated
 * to by URL in `e2e/admin.spec.ts`. A 404 for any of those is a worse outcome
 * than one extra hop, and the redirect costs nothing to keep.
 */
export default async function EditGameRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/games/${id}`);
}
