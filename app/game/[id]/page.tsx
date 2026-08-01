import type { Metadata } from "next";
import Link from "next/link";
import { Roster } from "@/components/Roster";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { FormatChips } from "@/components/game/FormatChips";
import { SharePair } from "@/components/game/SharePair";
import { SkillBadges } from "@/components/game/SkillBadges";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { WaitlistPanel } from "@/components/game/WaitlistPanel";
import { YourBookingPanel } from "@/components/game/YourBookingPanel";
import { VenueMapPanel } from "@/components/VenueMapPanel";
import { WaitlistButton } from "@/components/WaitlistButton";
import { isOnWaitlist, waitlistPosition } from "@/lib/booking/waitlistConvert";
import { readResumeIntent } from "@/lib/booking/resume";
import { runJoinWaitlist } from "./waitlist/actions";
import { getCurrentPlayer, getSessionUser } from "@/lib/auth/session";
import { formatCzk, formatGameDateTime, formatGameTimeSpan } from "@/lib/format";
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
import { gameUrgency, spotsLeftLabel, urgencyLabel } from "@/lib/games/urgency";
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
  const urgency = gameUrgency(bookedCount, game.capacity);
  const canAct = !isCancelled && !hasStarted;

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
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
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

      <Link
        href="/games"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {t.games.backToGames}
      </Link>

      {/* `venue` is admin-supplied free text; JSX text interpolation escapes it. */}
      <h1 className="mt-4 font-display text-section-title uppercase tracking-wide text-white">
        {game.venue}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* The SPAN, not the kick-off alone (§5.2, REQ-GAME-007). The end time
            comes from `gameEndsAt`, the same call the `.ics` DTEND and the
            schema.org endDate make, so the page cannot disagree with the
            calendar entry a player downloads from it. */}
        <span data-testid="game-time-span" className="font-mono text-[13px] tracking-[1px] text-volt">
          {formatGameTimeSpan(game.starts_at, endsAt)}
        </span>
        <span className="font-mono text-[13px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
        {/* Format, substitutes and surface, exactly as the organizer entered
            them. Above the map, per §5.3a — and derived from capacity nowhere. */}
        <FormatChips
          format={game.format}
          surface={game.surface}
          subsPerTeam={game.subs_per_team}
        />
        {/* Nothing at all on an all-levels game (§5.3, REQ-GAME-009). */}
        <SkillBadges levels={game.allowed_skill_levels} />
      </div>

      {game.allowed_skill_levels && (
        <p className="mt-2 font-mono text-[11px] tracking-[1px] text-faint">
          {t.games.skillNotEnforced}
        </p>
      )}

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
            {t.games.notesLabel}
          </div>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-bone">
            {game.notes}
          </p>
        </div>
      )}

      {/*
        The count, in the card's language rather than the game page's old one.
        This used to be `SpotsCounter`, which drew a single proportional bar —
        the one surface that disagreed with the reference's notch-per-spot bar.
        Same component as the cards now, so they cannot drift again.
      */}
      <div className="mt-7 rounded-card border border-hairline-volt bg-surface-panel p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span
            data-testid="urgency-label"
            className={`font-mono text-[10px] uppercase tracking-[2px] ${
              urgency === "full" ? "text-faint" : "text-volt-dim"
            }`}
          >
            {urgencyLabel(urgency, t)}
          </span>
          <span
            data-testid="spots-counter"
            className="font-mono text-[22px] font-bold text-white"
          >
            {String(Math.min(bookedCount, game.capacity)).padStart(2, "0")}/{game.capacity}
          </span>
        </div>

        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} />

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 pl-2">
          <AvatarRow
            players={roster.map((row) => ({
              nickname: row.nickname,
              photoPath: row.photo_path,
            }))}
            max={14}
            supabaseUrl={supabaseUrl}
          />
          {!isFull && (
            <span data-testid="spots-left" className="text-[13px] text-muted-dim">
              <b className="text-volt">{spotsLeftLabel(bookedCount, game.capacity, t)}</b>
            </span>
          )}
        </div>
      </div>

      {isCancelled && (
        <p className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
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
          className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
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
        happens whenever two blocks disagree about who the viewer is.
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
            className="mt-5 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint"
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

      {canAct && !holdsSpot && !isFull && (
        <Link
          href={`/game/${game.id}/book`}
          data-testid="book-cta"
          className="mt-6 block rounded-cta bg-volt px-6 py-4 text-center font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
        >
          {signedIn ? t.booking.claimSpot : t.booking.logInToClaim}
        </Link>
      )}

      {/*
        The organizer. The NAME is public — it tells a player who is running
        the game. The PHONE arrives non-null only for someone holding a spot,
        decided inside `game_organizer_phone()` from the session; there is no
        branch here that could be wrong about it, because there is nothing here
        to branch on. The note beside it says why they can see it, so the
        number does not read as something that leaked.
      */}
      {organizer.name && (
        <section
          data-testid="game-organizer"
          className="mt-6 rounded-card border border-hairline bg-surface-card p-5"
        >
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
            {t.games.organizerLabel}
          </div>
          <p className="mt-2 text-[14px] text-bone" data-testid="organizer-name">
            {organizer.name}
          </p>
          {organizer.phone && (
            <>
              <a
                href={`tel:${organizer.phone}`}
                data-testid="organizer-phone"
                className="mt-1 inline-block font-mono text-[14px] text-volt no-underline"
              >
                {organizer.phone}
              </a>
              <p className="mt-1 text-[12px] leading-snug text-muted-dim">
                {t.games.organizerPhoneNote}
              </p>
            </>
          )}
        </section>
      )}

      {/*
        PRACTICAL INFORMATION (§5.7, REQ-GAME-023).

        The questions someone asks the first time they turn up, in one block
        rather than scattered down the page. Arrival and equipment are fixed
        copy — they are true of every game this product runs — and the duration
        comes from the same resolver every other surface uses, so this block
        cannot disagree with the time span at the top of the page.
      */}
      <section
        data-testid="practical-info"
        className="mt-6 rounded-card border border-hairline bg-surface-card p-5"
      >
        <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {t.games.practicalTitle}
        </h2>
        <ul className="mt-3 flex list-none flex-col gap-2 p-0 text-[14px] leading-relaxed text-bone">
          <li>{t.games.practicalArrival}</li>
          <li>{t.games.practicalEquipment}</li>
          <li>
            <span className="text-muted">{t.games.practicalDuration}: </span>
            {t.games.practicalDurationValue.replace(
              "{minutes}",
              String(resolveDurationMinutes(game.duration_minutes)),
            )}
          </li>
        </ul>
      </section>

      {/* Copy link primary, WhatsApp secondary (§5.4, REQ-GAME-014). */}
      <div className="mt-8">
        <SharePair
          venue={game.venue}
          when={formatGameDateTime(game.starts_at)}
          url={`${await siteUrl()}/game/${game.id}`}
        />
      </div>

      <Roster rows={roster} supabaseUrl={supabaseUrl} />

      {/* The queue, in public. Rendered whenever the game is full or anyone is
          already waiting — an empty panel on a half-full game would be noise. */}
      {(isFull || waitlist.length > 0) && (
        <WaitlistPanel rows={waitlist} viewerNickname={viewerNickname} />
      )}

      {/* Booking created, cancelled, or signed in — whichever the redirect
          that landed here carried. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
