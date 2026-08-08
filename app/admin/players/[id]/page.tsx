import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAttendanceRow } from "@/components/admin/PlayerAttendanceRow";
import { RemovePhotoButton } from "@/components/admin/RemovePhotoButton";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminPlayer } from "@/lib/admin/queries";
import { formatCzk } from "@/lib/format";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { strings } from "@/lib/strings";

export const metadata = {
  title: strings.admin.playerDetailTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One player, everything the organizer needs about them (REQ-ADMIN-001).
 *
 * WHY A PAGE RATHER THAN AN EXPANDING ROW. The list answers "who is here and
 * what do they owe"; this answers "who is this person" — history, attendance,
 * the wallet behind the number. Those are different questions asked at
 * different moments, and cramming the second into the first is what made the
 * list unreadable before it existed.
 *
 * EVERYTHING SHOWN HERE IS PII an admin is entitled to see and nobody else is:
 * email, country, skill. The page is under `app/admin/layout.tsx`, which runs
 * `requireAdmin()` before any of this is reached, and every read goes through
 * the service-role client for the reason `lib/admin/queries.ts` documents.
 */
export default async function AdminPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getAdminPlayer(id);
  if (!detail) notFound();

  const { player, balanceCzk, gamesPlayed, noShowCount, games } = detail;
  const photo = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    player.photo_path,
    player.created_at,
  );

  return (
    <>
      <Link
        href="/admin/players"
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.common.back}
      </Link>

      {/* --- identity ---------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span
          data-testid="admin-player-avatar"
          className="flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface-avatar text-[22px] font-bold text-volt"
        >
          {photo ? (
            /* Plain <img>, like every other avatar in this product: a public
               bucket and a small circle do not need the optimizer. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              data-testid="admin-player-photo"
              className="h-full w-full object-cover"
            />
          ) : (
            initials(player.nickname, strings)
          )}
        </span>

        <div className="min-w-[200px] flex-1">
          {/* Nickname and email are free text; JSX escapes both. */}
          <h2 className="m-0 text-[22px] font-bold uppercase tracking-wide text-white">
            {player.nickname}
          </h2>
          <div
            data-testid="admin-player-email"
            className="text-[12px] tracking-[1px] text-muted"
          >
            {player.email ?? strings.admin.playerNoEmail}
          </div>
        </div>

        {player.photo_path && <RemovePhotoButton playerId={player.id} />}
      </div>

      {/* --- the numbers ------------------------------------------------------- */}
      <dl className="mt-6 grid max-w-[460px] grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[12px]">
        <dt className="text-muted">{strings.admin.playerCountry}</dt>
        <dd data-testid="admin-player-country" className="m-0 text-bone">
          {player.country ?? "—"}
        </dd>
        <dt className="text-muted">{strings.admin.playerSkill}</dt>
        <dd data-testid="admin-player-skill" className="m-0 text-bone">
          {player.skill_level ? strings.admin.skillOptions[player.skill_level] : "—"}
        </dd>
        <dt className="text-muted">{strings.admin.playerBalance}</dt>
        <dd data-testid="admin-player-balance" className="m-0 text-bone">
          {formatCzk(balanceCzk)}
        </dd>
        <dt className="text-muted">{strings.admin.playerGamesPlayed}</dt>
        <dd data-testid="admin-player-games-played" className="m-0 text-bone">
          {gamesPlayed}
        </dd>
        <dt className="text-muted">{strings.admin.playerNoShows}</dt>
        <dd data-testid="admin-player-no-shows" className="m-0 text-bone">
          {noShowCount}
        </dd>
      </dl>

      {/* --- history, with the no-show control -------------------------------- */}
      <section className="mt-10">
        <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.playerGamesTitle}
        </h3>
        <p className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-muted">
          {strings.admin.playerGamesLede}
        </p>

        {games.length === 0 ? (
          <p className="mt-4 text-[12px] tracking-[1px] text-faint">
            {strings.admin.playerGamesEmpty}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-2 p-0">
            {games.map((row) => (
              <PlayerAttendanceRow key={row.bookingId} row={row} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
