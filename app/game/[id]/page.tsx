import type { Metadata } from "next";
import Link from "next/link";
import { AmenityGrid } from "@/components/game/AmenityGrid";
import { AvailabilityCard } from "@/components/game/AvailabilityCard";
import { GameHero } from "@/components/game/GameHero";
import { InfoCard } from "@/components/game/InfoCard";
import { OrganizerCard } from "@/components/game/OrganizerCard";
import { PlayersList } from "@/components/game/PlayersList";
import { StickyCta } from "@/components/game/StickyCta";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { WaitlistPanel } from "@/components/game/WaitlistPanel";
import { YourBookingPanel } from "@/components/game/YourBookingPanel";
import { WaitlistButton } from "@/components/WaitlistButton";
import { isOnWaitlist, waitlistPosition } from "@/lib/booking/waitlistConvert";
import { readResumeIntent } from "@/lib/booking/resume";
import { runJoinWaitlist } from "./waitlist/actions";
import { getCurrentPlayer, getSessionUser } from "@/lib/auth/session";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { gameEndsAt, resolveDurationMinutes } from "@/lib/games/duration";
import {
  getGameById,
  getGameOrganizer,
  getOwnActiveBooking,
  getRoster,
  getVenue,
  getWaitlist,
} from "@/lib/games/queries";
import { gameEventSchema } from "@/lib/games/schemaOrg";
import { spotsLeftLabel } from "@/lib/games/urgency";
import { siteUrl } from "@/lib/site";
import { getStrings } from "@/lib/i18n/server";

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
  const t = await getStrings();
  const { id } = await params;
  const result = await getGameById(id);

  if (!result) {
    return { title: t.games.notFound, description: t.meta.description };
  }

  const { game } = result;
  const title = `${game.venue} — ${formatGameDateTime(game.starts_at)}`;
  // Same ladder the page renders, so the WhatsApp preview and the page it
  // links to never disagree about how urgent the game is.
  const description = `${spotsLeftLabel(result.bookedCount, game.capacity, t)} · ${formatCzk(
    game.price_czk,
  )}`;

  const url = `${await siteUrl()}/game/${game.id}`;

  return {
    title,
    description,
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GameDetailPage({ params, searchParams }: GamePageProps) {
  const t = await getStrings();
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const result = await getGameById(id);

  if (!result) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="font-mono text-[12px] tracking-[1px] text-faint">
          {t.games.notFound}
        </p>
        <Link
          href="/games"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {t.games.backToGames}
        </Link>
      </main>
    );
  }

  const { game, bookedCount, spotsLeft, hasStarted, inProgress, isCancelled } = result;
  const roster = await getRoster(game.id);
  // Storage origin for the roster photos. Read here rather than inside
  // `AvatarRow` so the component stays renderable in isolation; absent, every
  // avatar falls back to initials, which is the correct degradation.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const venueRow = await getVenue(game.venue_id);
  // The queue is public — see migration 20 and getWaitlist(). Fetched for every
  // visitor, signed in or not, because "who is waiting" is part of what makes a
  // full game worth queueing for.
  const waitlist = await getWaitlist(game.id);

  // §5.1 — two different kinds of fact through two different exits. The name is
  // public; the phone comes back non-null only for a caller holding a spot, and
  // the function decides that from the session, not from anything passed here.
  const organizer = await getGameOrganizer(game.id);

  // REQ-GAME-018. Resolved from the caller's OWN booking row under RLS. A
  // nickname match against the public roster would be display-grade and would
  // hand anyone "their" booking by choosing the right nickname.
  const ownBooking = await getOwnActiveBooking(game.id);

  const endsAt = gameEndsAt(game.starts_at, game.duration_minutes);
  const isFull = spotsLeft === 0;
  const canAct = !isCancelled && !hasStarted;
  const shareUrl = `${await siteUrl()}/game/${game.id}`;

  // A holder is never offered a claim (§5.6). Everything below branches on
  // this one value rather than each block deciding for itself.
  const holdsSpot = ownBooking !== null;

  // Label only. The write is gated in `createBookingAction`, not here — an
  // anonymous visitor may still walk the whole flow and authenticate at the
  // end, which is the no-pre-auth-hold rule.
  const signedIn = (await getSessionUser()) !== null;

  // DISPLAY ONLY: used to ring the viewer's own avatar in the public queue.
  // The views project no player id, so a nickname match is the only way to
  // answer "which of these is me" — adequate for a highlight, and never the
  // authority on membership (that is `isOnWaitlist`, which reads under RLS).
  const viewerNickname = signedIn ? ((await getCurrentPlayer())?.nickname ?? null) : null;

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

  // Structured data for search results. Built from the same numbers the page
  // renders, so the two cannot disagree about price or how full the game is.
  const schema = gameEventSchema({
    game,
    spotsLeft,
    url: `${await siteUrl()}/game/${game.id}`,
    venueName: venueRow?.name ?? game.venue,
    city: game.city,
  });


  return (
    <main
      /*
        `pb-40` clears the sticky CTA. Without it the last section of the page —
        the lineup — sits permanently behind an opaque bar, which is the
        classic sticky-footer bug: the content is there, scrollable, and its
        final rows can never be read.
      */
      className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-40"
    >
      {/*
        JSON-LD. `JSON.stringify` output is inserted into a <script> body, so
        the one dangerous sequence is a literal `</script>` inside admin-supplied
        free text (the venue name, the notes). Escaping `<` closes that off —
        this is the standard mitigation, and it is why the payload is built by a
        pure function and serialized here rather than assembled as markup.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />

      {/*
        THE ORDER OF THIS PAGE IS THE ARGUMENT IT MAKES (v1.2 §5).

        Hero, then when-and-where, then how-full, then what's-included, then
        who. It walks the questions a player asks in the order they ask them:
        where is it, when is it, can I still get in, what do I bring, who is
        going. The previous order was roughly the order the features shipped in
        — heading, chips, price, map, notes, counter, CTA, organizer, practical
        info, share, roster, waitlist — and the reader had to assemble the
        answer from four places.

        The claim button is no longer part of this order at all: it is fixed to
        the bottom of the viewport, so it is reachable from wherever the reader
        happens to form the decision.
      */}
      <GameHero venue={game.venue} venueRow={venueRow} supabaseUrl={supabaseUrl} />

      <InfoCard
        game={game}
        venueRow={venueRow}
        endsAt={endsAt}
        shareUrl={shareUrl}
        shareWhen={formatGameDateTime(game.starts_at)}
      />

      {/* Organizer logistics. Free text; JSX escapes it, and
          `whitespace-pre-line` keeps the admin's line breaks without
          interpreting anything else. */}
      {game.notes && (
        <div
          data-testid="game-notes"
          className="mt-4 rounded-card border border-hairline bg-surface-card p-5"
        >
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted">
            {t.games.notesLabel}
          </div>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-bone">
            {game.notes}
          </p>
        </div>
      )}

      <AvailabilityCard bookedCount={bookedCount} capacity={game.capacity} />

      {isCancelled && (
        <p className="mt-4 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {t.games.cancelled}
        </p>
      )}

      {/*
        Kicked off, and whether it is still running. `hasStarted` alone cannot
        tell those apart — a game that started ten minutes ago and one that
        finished two hours ago are the same boolean and very different
        sentences. This is the "in progress" site the contract names as reading
        the per-game duration (§5.2, REQ-GAME-008); `isInProgress` resolves the
        null fallback in the same place every other surface does.
      */}
      {!isCancelled && hasStarted && (
        <p
          data-testid={inProgress ? "in-progress-notice" : "started-notice"}
          className="mt-4 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
        >
          {inProgress ? t.games.inProgress : t.games.alreadyStarted}
        </p>
      )}

      {/*
        §5.6 — THREE STATES, AND THEY ARE MUTUALLY EXCLUSIVE.

        A holder sees their booking and no claim CTA. A non-holder sees the
        claim only while spots remain. A full game offers the waitlist to a
        non-holder, per Phase 1.

        `holdsSpot` gates the other two rather than each block deciding for
        itself: the failure being fixed here is a page that asked a player who
        had already paid to claim a spot they were standing on, and that
        happens whenever two blocks disagree about who the viewer is. The
        sticky CTA at the bottom is bound by the SAME condition, so there is
        still exactly one claim button in the product (§5.6a).
      */}
      {ownBooking && (
        <YourBookingPanel
          booking={ownBooking.booking}
          canCancel={ownBooking.canCancel}
        />
      )}

      {canAct && !holdsSpot && isFull && (
        <>
          <p
            data-testid="full-notice"
            className="mt-4 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
          >
            {t.games.fullNotice}
          </p>
          <WaitlistButton
            gameId={game.id}
            alreadyOnList={alreadyOnList}
            position={position}
          />
        </>
      )}

      {/* What the venue provides (§5.7). Nothing renders when nothing is
          recorded — an empty "What's included" card is a claim that the venue
          provides nothing. */}
      <AmenityGrid amenities={venueRow?.amenities ?? null} />

      {/*
        The organizer. The NAME is public — it tells a player who is running
        the game. The PHONE arrives non-null only for someone holding a spot,
        decided inside `game_organizer_phone()` from the session; there is no
        branch here that could be wrong about it, because there is nothing here
        to branch on.
      */}
      {organizer.name && (
        <OrganizerCard name={organizer.name} phone={organizer.phone} />
      )}

      <PlayersList rows={roster} supabaseUrl={supabaseUrl} />

      {/* The queue, in public. Rendered whenever the game is full or anyone is
          already waiting — an empty panel on a half-full game would be noise. */}
      {(isFull || waitlist.length > 0) && (
        <WaitlistPanel rows={waitlist} viewerNickname={viewerNickname} />
      )}

      {/*
        PRACTICAL INFORMATION (§5.7, REQ-GAME-023) — what is left of it.
        Arrival and duration are true of the game rather than of the venue, so
        they stay here; equipment moved into the amenity grid above, where it
        is a per-venue fact an organizer can turn off rather than a promise a
        string table makes about every pitch forever.
      */}
      <section
        data-testid="practical-info"
        className="mt-4 rounded-card border border-hairline bg-surface-card p-5"
      >
        <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {t.games.practicalTitle}
        </h2>
        <ul className="mt-3 flex list-none flex-col gap-2 p-0 text-[14px] leading-relaxed text-bone">
          <li>{t.games.practicalArrival}</li>
          <li>
            <span className="text-muted">{t.games.practicalDuration}: </span>
            {t.games.practicalDurationValue.replace(
              "{minutes}",
              String(resolveDurationMinutes(game.duration_minutes)),
            )}
          </li>
        </ul>
      </section>

      {/* Booking created, cancelled, or signed in — whichever the redirect
          that landed here carried. */}
      <ToastFromQuery query={query} />

      {/*
        THE ONE CLAIM BUTTON, bound by exactly the condition the inline block
        it replaced used. A holder never sees it; a full game offers the
        waitlist above instead; a cancelled or started game offers nothing.
      */}
      {canAct && !holdsSpot && !isFull && (
        <StickyCta gameId={game.id} priceCzk={game.price_czk} signedIn={signedIn} />
      )}
    </main>
  );
}
