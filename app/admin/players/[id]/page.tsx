import { notFound } from "next/navigation";
import { AdminRightsButton } from "@/components/admin/AdminRightsButton";
import { BanPlayerButton } from "@/components/admin/BanPlayerButton";
import { ChangeNameForm } from "@/components/admin/ChangeNameForm";
import { DeletePlayerButton } from "@/components/admin/DeletePlayerButton";
import { GrantCreditForm } from "@/components/admin/GrantCreditForm";
import { OrganizerRightsButton } from "@/components/admin/OrganizerRightsButton";
import { PlayerAttendanceRow } from "@/components/admin/PlayerAttendanceRow";
import { RemoveCoverButton } from "@/components/admin/RemoveCoverButton";
import { RemoveCreditForm } from "@/components/admin/RemoveCreditForm";
import { RemovePhotoButton } from "@/components/admin/RemovePhotoButton";
import { KpiTile } from "@/components/admin/players/KpiTile";
import { MoneySpentPanel } from "@/components/admin/players/MoneySpentPanel";
import { PlayerHeader } from "@/components/admin/players/PlayerHeader";
import { SectionHeading } from "@/components/admin/players/SectionHeading";
import { Panel } from "@/components/admin/ui/Panel";
import { adminWallet } from "@/lib/admin/credits";
import { getBookingSeatValues } from "@/lib/admin/economics";
import { historyFigures } from "@/lib/admin/players/activity";
import { CAME_BACK_GAMES } from "@/lib/admin/players/segments";
import { playerSpend } from "@/lib/admin/players/spend";
import { getAdminPlayer } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { appCapabilities } from "@/lib/db/capabilities";
import { formatCzk, formatDate } from "@/lib/format";
import { avatarUrl } from "@/lib/storage/avatar";
import { profilePhotoVersion } from "@/lib/storage/photoVersions";
import { strings } from "@/lib/strings";

export const metadata = {
  title: strings.admin.playerDetailTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const t = strings.admin.playersHub;

/** Under the last game: whether they came back, in words. */
function cameBackLine(gamesPlayed: number): string {
  if (gamesPlayed >= CAME_BACK_GAMES) return t.playerKpis.cameBack.replace("{n}", String(gamesPlayed));
  if (gamesPlayed === 1) return t.playerKpis.oneGame;
  return t.playerKpis.notPlayed;
}

/**
 * One player, everything the organizer needs about them (REQ-ADMIN-001;
 * rebuilt round 42).
 *
 * WHO, THEN THE NUMBERS, THEN WHAT YOU CAN DO, THEN WHAT HAPPENED. The header
 * says who this is and how to reach them; four figures say how they play and
 * what they hold (and, once the pitch-cost migration is live, what they have
 * paid); the controls sit in three panels by what they change — rights, the
 * account, the Credit — and the history closes the page with its attendance
 * controls.
 *
 * EVERY CONTROL IS THE ONE THAT WAS HERE, with its own confirm step, its own
 * capability gate and its own RPC — `set_player_admin`, `admin_set_organizer`,
 * `grant_credit` and the rest re-check authorization inside the function, so
 * these panels are controls over a boundary that was already there. The
 * panels only regroup them.
 *
 * EVERYTHING SHOWN HERE IS PII an admin is entitled to see and nobody else is.
 * The page is under `app/admin/layout.tsx`, which runs `requireAdmin()` first,
 * and every read goes through the service-role client.
 */
export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const acting = await requireAdmin();
  const { id } = await params;
  const detail = await getAdminPlayer(id);
  if (!detail) notFound();

  // Every control below an RPC is gated: a control whose function does not
  // exist is a button that 404s, which round 12 ruled against.
  const capabilities = await appCapabilities();

  const { player, balanceCzk, games } = detail;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [photoVersion, coverVersion] = await Promise.all([
    profilePhotoVersion(player.photo_path),
    profilePhotoVersion(player.cover_path ?? null),
  ]);
  // Round 41: the bytes' own version — `created_at` never moved.
  const photo = avatarUrl(supabaseUrl, player.photo_path, photoVersion);
  const cover = avatarUrl(supabaseUrl, player.cover_path ?? null, coverVersion);

  const figures = historyFigures(games);
  const wallet = adminWallet(balanceCzk);
  const spend = capabilities.pitchCosts
    ? playerSpend(await getBookingSeatValues([...new Set(games.map((row) => row.gameId))]), player.id)
    : null;

  const isDeleted = Boolean(player.deleted_at);
  const canBan = capabilities.banProfile && !isDeleted;
  const canDelete = capabilities.deleteAccount && !isDeleted && !player.is_admin;

  return (
    <>
      <PlayerHeader player={player} photoUrl={photo} coverUrl={cover} />

      {/* --- the figures ------------------------------------------------------ */}
      <section data-testid="admin-player-stats" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label={t.playerKpis.gamesPlayed} value={String(figures.gamesPlayed)} valueTestId="admin-player-games-played">
          <span>
            {strings.admin.bookingsLabel} {games.length}
          </span>
        </KpiTile>
        <KpiTile
          label={t.playerKpis.lastGame}
          value={figures.lastGameAt ? formatDate(figures.lastGameAt) : t.noGameYet}
          valueTestId="admin-player-last-game"
          size="md"
          tone="white"
        >
          <span data-testid="admin-player-came-back" className={figures.gamesPlayed >= CAME_BACK_GAMES ? "text-volt" : undefined}>
            {cameBackLine(figures.gamesPlayed)}
          </span>
        </KpiTile>
        <KpiTile label={t.playerKpis.noShows} value={String(figures.noShows)} valueTestId="admin-player-no-shows" tone="white">
          <span>{t.playerKpis.noShowsDetail}</span>
        </KpiTile>
        {/*
          THE WALLET READS IN CREDITS, EXACTLY AS THE PLAYER SEES IT (round 31,
          item 3), and the ragged case is handled rather than rounded: the count
          is a FLOOR, so a balance that does not divide into whole Credits shows
          its exact crowns beneath.
        */}
        <KpiTile label={t.playerKpis.credit} value={String(wallet.credits)} valueTestId="admin-player-balance">
          {wallet.remainderCzk !== null && (
            <span data-testid="admin-player-balance-exact" className="text-faint">
              {strings.admin.walletExactCzk.replace("{czk}", formatCzk(wallet.remainderCzk))}
            </span>
          )}
        </KpiTile>
      </section>

      {spend && (
        <div className="mt-3">
          <MoneySpentPanel spend={spend} />
        </div>
      )}

      {/* --- the controls, by what they change -------------------------------- */}
      <div data-testid="admin-actions" className="mt-6 grid gap-4 md:grid-cols-2 md:items-start">
        <Panel testId="admin-player-rights">
          <SectionHeading title={t.rightsTitle} lede={t.rightsLede} />
          <div className="flex flex-wrap items-center gap-3">
            <AdminRightsButton playerId={player.id} isAdmin={player.is_admin} />
            {/* Round 42 — beside admin rights, as the owner asked. */}
            {capabilities.organizerPlayer && !isDeleted && (
              <OrganizerRightsButton playerId={player.id} isOrganizer={Boolean(player.is_organizer)} />
            )}
          </div>
          {player.id === acting.id && (
            <p data-testid="admin-rights-self-note" className="m-0 mt-3 text-[12px] text-faint">
              {strings.admin.adminSelfNote}
            </p>
          )}
        </Panel>

        <Panel testId="admin-player-account">
          <SectionHeading title={t.accountTitle} />

          {/*
            HOW THEY APPEAR. The rename is always offered — a name always exists
            (round 33, item 1) — and each image removal only when there is an
            image to remove, because an enabled button for an absent photo is a
            promise the page cannot keep.
          */}
          <h4 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-faint">{t.accountProfile}</h4>
          <div className="mt-2 flex flex-wrap items-start gap-3">
            {capabilities.adminRenamePlayer && <ChangeNameForm playerId={player.id} name={player.nickname} />}
            {player.photo_path && <RemovePhotoButton playerId={player.id} />}
            {player.cover_path && <RemoveCoverButton playerId={player.id} />}
          </div>

          {/*
            ACCESS — what the account IS. A deleted account has nothing left to
            ban or delete (round 40), so only its notice remains.
          */}
          {(canBan || canDelete || player.banned_at) && (
            <div className="mt-4 border-t border-hairline pt-4">
              <h4 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-faint">{t.accountAccess}</h4>
              {(canBan || canDelete) && <p className="m-0 mt-1 text-[12px] text-muted">{t.accountAccessLede}</p>}
              {(canBan || canDelete) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {canBan && <BanPlayerButton playerId={player.id} isBanned={Boolean(player.banned_at)} />}
                  {canDelete && <DeletePlayerButton playerId={player.id} />}
                </div>
              )}
              {/*
                THE STATE ITSELF, said once and plainly: a banned account is a
                fact about the person, not a property of one button — an
                organizer scrolling to the history needs to know why it stops.
              */}
              {player.banned_at && (
                <p
                  data-testid={isDeleted ? "player-deleted-notice" : "player-banned-notice"}
                  className="m-0 mt-3 text-[11px] uppercase tracking-eyebrow text-danger"
                >
                  {isDeleted ? strings.admin.deleted : strings.admin.banned}
                </p>
              )}
            </div>
          )}
        </Panel>

        {/*
          THE CREDIT, BOTH DIRECTIONS (round 28, item 5b) — one act with a sign,
          side by side and alike, but only the removal arms itself before it
          will submit. The floor that stops a wallet going negative is
          `grant_credit`'s, under the player's advisory lock.
        */}
        <Panel testId="admin-player-credit" className="md:col-span-2">
          <SectionHeading title={t.creditTitle} lede={t.creditLede} />
          <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
            <GrantCreditForm playerId={player.id} />
            <RemoveCreditForm playerId={player.id} balanceCzk={balanceCzk} />
          </div>
        </Panel>
      </div>

      {/* --- history, with the no-show control -------------------------------- */}
      <Panel testId="admin-player-history" className="mt-6">
        <SectionHeading title={strings.admin.playerGamesTitle} lede={strings.admin.playerGamesLede} />
        {games.length === 0 ? (
          <p className="m-0 text-small text-faint">{strings.admin.playerGamesEmpty}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {games.map((row) => (
              <PlayerAttendanceRow key={row.bookingId} row={row} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
