import Link from "next/link";
import { MergeForm } from "@/components/admin/MergeForm";
import { listPlayers } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

/**
 * The shadow merge.
 *
 * Reachable only from the admin path, and gated by the admin layout like every
 * route under it. That matters more here than elsewhere: this is the ONLY way
 * an email-less shadow ever becomes a real account, because the Phase 8
 * auto-claim needs an exact email match and a shadow with no email has nothing
 * to match on.
 */
export default async function MergePlayersPage() {
  const players = await listPlayers();

  return (
    <>
      <Link
        href="/admin/players"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.common.back}
      </Link>

      <h2 className="mt-4 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.mergeTitle}
      </h2>
      <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-muted-dim">
        {strings.admin.mergeLede}
      </p>

      <MergeForm players={players} />
    </>
  );
}
