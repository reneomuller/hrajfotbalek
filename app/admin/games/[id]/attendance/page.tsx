import { redirect } from "next/navigation";

/**
 * `/admin/games/[id]/attendance` — merged into the game surface in Phase 18
 * (§7, REQ-ADMIN-003).
 *
 * The roster now carries the attendance controls on the same rows as the
 * payment badges, and the settle block sits beneath it — which is the order
 * the organizer actually works in at close-out.
 *
 * Kept as a redirect for the same reason as `/edit`: the URL is linked, typed
 * and navigated to by the E2E suite, and a 404 is worse than one hop.
 */
export default async function AttendanceRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/games/${id}`);
}
