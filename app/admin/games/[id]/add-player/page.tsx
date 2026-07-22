import Link from "next/link";
import { notFound } from "next/navigation";
import { AddPlayerForm } from "@/components/admin/AddPlayerForm";
import { getAdminGame } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

/**
 * Add a shadow player to a game.
 *
 * Exists because people still book over WhatsApp and may never log in. The row
 * this creates is a first-class identity — it can be claimed automatically on
 * exact email match at first sign-in (Phase 8), or merged by an admin (Phase
 * 25) when there is no email to match on.
 */
export default async function AddPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getAdminGame(id);
  if (!game) notFound();

  return (
    <>
      <Link
        href={`/admin/games/${game.id}`}
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.common.back}
      </Link>

      <h2 className="mt-4 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.addPlayerTitle}
      </h2>
      <p className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
        {game.venue} · {game.activeCount}/{game.capacity}
      </p>
      <p className="mt-3 max-w-[480px] text-[13px] leading-relaxed text-muted-dim">
        {strings.admin.addPlayerLede}
      </p>

      <AddPlayerForm gameId={game.id} />
    </>
  );
}
