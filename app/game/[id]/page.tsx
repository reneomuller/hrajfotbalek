import type { Metadata } from "next";
import Link from "next/link";
import { Roster } from "@/components/Roster";
import { VenueMapPanel } from "@/components/VenueMapPanel";
import { WaitlistButton } from "@/components/WaitlistButton";
import { isOnWaitlist, waitlistPosition } from "@/lib/booking/waitlistConvert";
import { readResumeIntent } from "@/lib/booking/resume";
import { runJoinWaitlist } from "./waitlist/actions";
import { getSessionUser } from "@/lib/auth/session";
import { SpotsCounter } from "@/components/SpotsCounter";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getGameById, getRoster, getVenue } from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";
import { strings } from "@/lib/strings";

// The primary surface players land on from a shared WhatsApp link. It must
// render completely for a visitor with no session, so nothing here is gated.
export const dynamic = "force-dynamic";

interface GamePageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Open Graph tags for the WhatsApp preview card.
 *
 * `venue` is admin-supplied free text reaching an HTML *attribute* here, which
 * is a different grammar from the JSX text children elsewhere on this page.
 * Next.js serializes these values into `content="…"` and escapes them for that
 * position — the important part is that the raw string is handed to the
 * metadata API rather than being concatenated into markup by hand, which is
 * what would reintroduce the injection.
 */
export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getGameById(id);

  if (!result) {
    return { title: strings.games.notFound, description: strings.meta.description };
  }

  const { game, spotsLeft } = result;
  const title = `${game.venue} — ${formatGameDateTime(game.starts_at)}`;
  const description = spotsLeft > 0
    ? `${spotsLeft} ${spotsLeft === 1 ? strings.games.spotLeft : strings.games.spotsLeft} · ${formatCzk(game.price_czk)}`
    : `${strings.games.full} · ${formatCzk(game.price_czk)}`;

  const url = `${await siteUrl()}/game/${game.id}`;

  return {
    title,
    description,
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GameDetailPage({ params, searchParams }: GamePageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const result = await getGameById(id);

  if (!result) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="font-mono text-[12px] tracking-[1px] text-faint">
          {strings.games.notFound}
        </p>
        <Link
          href="/games"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.games.backToGames}
        </Link>
      </main>
    );
  }

  const { game, bookedCount, spotsLeft, hasStarted, isCancelled } = result;
  const roster = await getRoster(game.id);
  const venueRow = await getVenue(game.venue_id);

  const isFull = spotsLeft === 0;
  const canAct = !isCancelled && !hasStarted;

  // Label only. The write is gated in `createBookingAction`, not here — an
  // anonymous visitor may still walk the whole flow and authenticate at the
  // end, which is the no-pre-auth-hold rule.
  const signedIn = (await getSessionUser()) !== null;

  // A full game now offers the waitlist rather than a dead end: `join_waitlist`
  // exists as of Phase 17, so the CTA leads somewhere real. Read under own-row
  // RLS, so a signed-out visitor simply gets false.
  let alreadyOnList = isFull && signedIn ? await isOnWaitlist(game.id) : false;

  // Post-auth resume for a Join-waitlist tap made while signed out. The
  // callback sends the player back here with ?resume=join_waitlist, and the
  // join runs now that there is a session — the same shape the booking resume
  // uses on /book. Nothing was held in the meantime; a waitlist row is not a
  // claim on a spot.
  if (signedIn && canAct && isFull && !alreadyOnList) {
    const resume = readResumeIntent(query);
    if (resume?.action === 'join_waitlist') {
      const outcome = await runJoinWaitlist(game.id);
      alreadyOnList = outcome.status === 'joined' || outcome.status === 'already';
    }
  }

  // Where they stand in the queue. Read after the resume above so a player who
  // just joined on the way back from the magic link sees their position on this
  // render rather than the next one. Counting happens inside the RPC — own-row
  // RLS hides the rows the count is over.
  const position = alreadyOnList ? await waitlistPosition(game.id) : null;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <Link
        href="/games"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      {/* `venue` is admin-supplied free text; JSX text interpolation escapes it. */}
      <h1 className="mt-4 font-display text-section-title uppercase tracking-wide text-white">
        {game.venue}
      </h1>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span className="font-mono text-[13px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </span>
        <span className="font-mono text-[13px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
        {/* Format and surface, when the organizer said. Chips, above the map. */}
        {game.format && (
          <span
            data-testid="game-format"
            className="rounded-chip bg-volt px-2 py-1 font-mono text-[10px] font-bold tracking-[1px] text-surface"
          >
            {game.format}
          </span>
        )}
        {game.surface && (
          <span
            data-testid="game-surface"
            className="rounded-chip border border-hairline-strong px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[1px] text-muted"
          >
            {strings.games.surface[game.surface]}
          </span>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-hairline">
        <VenueMapPanel venue={game.venue} venueRow={venueRow} className="h-[220px]" />
      </div>

      {/* Organizer logistics. Free text; JSX escapes it, and `whitespace-pre-line`
          keeps the admin's line breaks without interpreting anything else. */}
      {game.notes && (
        <div
          data-testid="game-notes"
          className="mt-5 rounded-card border border-hairline bg-surface-card p-5"
        >
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
            {strings.games.notesLabel}
          </div>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-bone">
            {game.notes}
          </p>
        </div>
      )}

      <div className="mt-7">
        <SpotsCounter capacity={game.capacity} bookedCount={bookedCount} />
      </div>

      {isCancelled && (
        <p className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.cancelled}
        </p>
      )}

      {!isCancelled && hasStarted && (
        <p className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.alreadyStarted}
        </p>
      )}

      {canAct && isFull && (
        <>
          <p
            data-testid="full-notice"
            className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
          >
            {strings.games.fullNotice}
          </p>
          <WaitlistButton
            gameId={game.id}
            alreadyOnList={alreadyOnList}
            position={position}
          />
        </>
      )}

      {canAct && !isFull && (
        <Link
          href={`/game/${game.id}/book`}
          data-testid="book-cta"
          className="mt-6 block rounded-cta bg-volt px-6 py-4 text-center font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
        >
          {signedIn ? strings.booking.claimSpot : strings.booking.logInToClaim}
        </Link>
      )}

      <Roster rows={roster} />
    </main>
  );
}
