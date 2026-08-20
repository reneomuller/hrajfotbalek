import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAttendanceRow } from "@/components/admin/PlayerAttendanceRow";
import { AdminRightsButton } from "@/components/admin/AdminRightsButton";
import { GrantCreditForm } from "@/components/admin/GrantCreditForm";
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

      {/*
        --- identity: the OWN-PROFILE SHAPE (round 7, item 9) ----------------

        Cover photograph, avatar overlapping its lower edge, name, meta line,
        three stat tiles. Deliberately the same composition as
        `components/account/ProfileIdentity.tsx` and `ProfileStats.tsx` rather
        than a second arrangement of the same facts: an admin looking at a
        player and that player looking at themselves should be looking at the
        same page, so "what does this person see" needs no translation.

        NOT THE SAME COMPONENTS, and that is a real decision rather than
        laziness. `ProfileIdentity` renders a PhotoUpload wrapper and reads the
        session's own row; making it serve both would mean a component that
        branches on who is looking, which is how an admin-only fact reaches a
        player's page. Two renderings of one composition, and the tokens keep
        them in step.
      */}
      <div aria-hidden className="relative -mx-gutter mt-4 h-[132px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pitch-default.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
        <span className="absolute inset-0 bg-gradient-to-b from-ink/[.45] via-ink/[.70] via-50% to-ink to-90%" />
      </div>

      {/* `relative`, or the positioned cover above paints over this row — the
          stacking bug round 6 hit on the player's own profile. */}
      <div className="relative -mt-10 flex items-end gap-4">
        <span
          data-testid="admin-player-avatar"
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface-avatar text-2xl font-extrabold text-volt"
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

        <div className="flex min-w-0 flex-col gap-[2px] pb-1">
          {/* Nickname is free text; JSX escapes it. */}
          <h2 className="m-0 truncate text-[26px] font-bold leading-tight text-white">
            {player.nickname}
          </h2>
          <p className="m-0 truncate text-small text-muted">
            {[
              player.country ?? null,
              player.skill_level ? strings.admin.skillOptions[player.skill_level] : null,
            ]
              .filter(Boolean)
              .join(" · ") || strings.admin.playerNoEmail}
          </p>
        </div>
      </div>

      {/* The three figures, as the profile lays them out. */}
      <section data-testid="admin-player-stats" className="mt-7 grid grid-cols-3 gap-3">
        <div>
          <div
            data-testid="admin-player-games-played"
            className="font-display text-[30px] leading-none text-white"
          >
            {gamesPlayed}
          </div>
          <div className="mt-[6px] text-eyebrow font-semibold uppercase leading-tight text-muted">
            {strings.admin.playerGamesPlayed}
          </div>
        </div>
        <div>
          <div
            data-testid="admin-player-no-shows"
            className="font-display text-[30px] leading-none text-white"
          >
            {noShowCount}
          </div>
          <div className="mt-[6px] text-eyebrow font-semibold uppercase leading-tight text-muted">
            {strings.admin.playerNoShows}
          </div>
        </div>
        <div>
          <div
            data-testid="admin-player-balance"
            className="font-display text-[30px] leading-none text-volt"
          >
            {formatCzk(balanceCzk)}
          </div>
          <div className="mt-[6px] text-eyebrow font-semibold uppercase leading-tight text-muted">
            {strings.admin.playerBalance}
          </div>
        </div>
      </section>

      {/*
        --- contact ------------------------------------------------------------

        EMAIL AND PHONE, WHICH IS WHY AN ADMIN OPENS THIS PAGE. Both are PII
        the admin surface is entitled to and nobody else is; the page sits
        under `app/admin/layout.tsx`, which gates before a row is read.

        The phone is here rather than on the player's own profile view of this
        page because the organizer's reason for wanting it — reaching someone
        about tonight's game — is an admin reason. Item 7 made it required at
        signup precisely so this field stops being empty.
      */}
      <section data-testid="admin-player-contact" className="lifted mt-6 rounded-card p-5">
        <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
          {strings.admin.contactTitle}
        </h3>
        <dl className="m-0 mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-[2px]">
            <dt className="field-label m-0">{strings.admin.contactEmail}</dt>
            <dd
              data-testid="admin-player-email"
              className={`m-0 text-body-lg font-semibold ${player.email ? "text-white" : "text-faint"}`}
            >
              {player.email ?? strings.admin.playerNoEmail}
            </dd>
          </div>
          <div className="flex flex-col gap-[2px]">
            <dt className="field-label m-0">{strings.admin.contactPhone}</dt>
            <dd
              data-testid="admin-player-phone"
              className={`m-0 text-body-lg font-semibold ${player.phone ? "text-white" : "text-faint"}`}
            >
              {player.phone ?? strings.admin.contactNone}
            </dd>
          </div>
        </dl>
      </section>

      {/*
        --- ADMIN ACTIONS -------------------------------------------------------

        ONE PANEL, AND IT IS BUILT TO GROW. Item 9 names three actions and says
        more are coming, so they sit in a labelled panel with a rule between
        rows rather than being scattered down the page — a fourth action is a
        new row, not a new layout decision.

        THEY MOVED HERE FROM THE LIST ROWS, which is the other half. The rights
        control and the credit form were on every row of `/admin/players`,
        interleaved with the facts — so the thing you could accidentally tap
        sat between two things you were only reading, on a list you scroll
        fast. An action that changes someone's rights or their money belongs on
        the page you opened deliberately.

        EVERY ONE OF THEM IS AN EXISTING RPC. `set_player_admin` and
        `grant_credit` both re-check authorization inside the function, so this
        panel is a set of controls over a boundary that was already there.
      */}
      <section data-testid="admin-actions" className="lifted mt-4 rounded-card p-5">
        <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
          {strings.admin.adminActionsTitle}
        </h3>

        <div className="mt-4 border-b border-hairline pb-4">
          <AdminRightsButton playerId={player.id} isAdmin={player.is_admin} />
        </div>

        <div className="pt-4">
          <GrantCreditForm playerId={player.id} />
        </div>

        {player.photo_path && (
          <div className="border-t border-hairline pt-4">
            <RemovePhotoButton playerId={player.id} />
          </div>
        )}
      </section>

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
