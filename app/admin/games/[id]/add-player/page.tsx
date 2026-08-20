import { redirect } from "next/navigation";

/**
 * `/admin/games/[id]/add-player` — merged into the game surface in round 9
 * (item 6).
 *
 * KEPT AS A REDIRECT RATHER THAN DELETED, on exactly the precedent Phase 18
 * set for `/edit` and `/attendance`: the route was linked from the game page,
 * is typed from memory by the one person who uses this panel, and is navigated
 * to by URL in `e2e/admin.spec.ts`. A 404 for any of those is a worse outcome
 * than one extra hop, and the redirect costs nothing to keep.
 *
 * The form now sits under the roster it changes, behind a disclosure — see the
 * note at its new home.
 */
export default async function AddPlayerRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /*
   * `?add=1` OPENS THE DISCLOSURE ON ARRIVAL. Somebody following the old route
   * — a bookmark, a typed URL, a link in a message — wanted the form, and
   * dropping them on a page where it is collapsed makes them hunt for what
   * they asked for by name.
   */
  redirect(`/admin/games/${id}?add=1`);
}
