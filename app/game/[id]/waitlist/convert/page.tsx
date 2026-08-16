import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistConvert } from "@/components/WaitlistConvert";
import { WaitlistStatus } from "@/components/game/WaitlistStatus";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getGameById } from "@/lib/games/queries";
import { isOnWaitlist } from "@/lib/booking/waitlistConvert";
import { getStrings } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.games.waitlistConvertTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * The landing page for the waitlist spot-open email.
 *
 * Gated on a session because converting writes a booking. The waitlist row
 * itself is read under own-row RLS, so a player who is not on this game's list
 * sees the not-on-the-list state rather than a conversion form that would fail.
 */
export default async function WaitlistConvertPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getStrings();
  const { id } = await params;
  await requireCurrentPlayer(`/game/${id}/waitlist/convert`);

  const result = await getGameById(id);
  if (!result) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="text-[12px] tracking-[1px] text-faint">
          {t.games.notFound}
        </p>
      </main>
    );
  }

  const { game } = result;
  const onList = await isOnWaitlist(game.id);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <Link
        href={`/game/${game.id}`}
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {t.booking.backToGame}
      </Link>

      <h1 className="mt-4 font-display text-section-title uppercase tracking-wide text-white">
        {game.venue}
      </h1>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span className="text-[13px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </span>
        <span className="text-[13px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
      </div>

      <div className="mt-8">
        {onList ? (
          <>
            {/*
              THE SPOT-OPENED STATE (§3 screen 8). This page is reached from
              the "a spot just opened" email, so the reader arrives already
              told — what they need here is confirmation they can still act,
              and the honest caveat that everyone else was told too.

              NO `hint` PROP, deliberately. `waitlistSpotOpenBody` already
              says everyone was told at the same moment, and passing the hint
              printed the same fact twice in two tenses — "Everyone waiting
              WAS told…" above "Everyone waiting IS told…". The hint exists to
              keep a POSITION NUMBER honest; there is no number on this screen,
              so the body carries the whole job.
            */}
            <WaitlistStatus
              tone="open"
              title={t.games.waitlistSpotOpenTitle}
              body={t.games.waitlistSpotOpenBody}
            />

            <div className="mt-6">
              <WaitlistConvert gameId={game.id} />
            </div>
          </>
        ) : (
          /*
            THE NOT-ON-THE-LIST STATE. It was a grey one-line box, which reads
            as a dead end on a page someone reached from an email — and the
            commonest reason to land here is that the spot was taken while
            they were opening it, which is worth saying rather than leaving
            them to infer.
          */
          <WaitlistStatus
            tone="absent"
            title={t.games.waitlistNotOnListTitle}
            body={t.games.waitlistNotOnListBody}
            action={{ href: `/game/${game.id}`, label: t.games.waitlistSeeGame }}
          />
        )}
      </div>
    </main>
  );
}
