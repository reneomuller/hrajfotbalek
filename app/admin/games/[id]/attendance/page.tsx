import { redirect } from "next/navigation";

/**
 * `/admin/games/[id]/attendance` — merged into the game surface in Phase 18
 * (§7, REQ-ADMIN-003).
 *
 * ~~The roster carries the attendance controls~~ — attendance is gone
 * (2026-11-09). The redirect stays so an old bookmark still lands on the game.
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
