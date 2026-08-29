import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AmenityGrid } from "@/components/game/AmenityGrid";
import { AvailabilityCard } from "@/components/game/AvailabilityCard";
import { GameHero } from "@/components/game/GameHero";
import { InfoCard } from "@/components/game/InfoCard";
import { OrganizerCard } from "@/components/game/OrganizerCard";
import { PlayersList } from "@/components/game/PlayersList";
import { ClaimBar } from "@/components/game/ClaimBar";
import { ShareButton } from "@/components/game/ShareButton";
import { effectivePitchName, venueDisplayName } from "@/lib/venues/displayName";
import { bookingBadge } from "@/lib/booking/badges";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { WaitlistPanel } from "@/components/game/WaitlistPanel";
import { AwaitingPaymentPanel } from "@/components/game/AwaitingPaymentPanel";
import { YourBookingPanel } from "@/components/game/YourBookingPanel";
import { isOnWaitlist, waitlistPosition } from "@/lib/booking/waitlistConvert";
import { readResumeIntent } from "@/lib/booking/resume";
import { runJoinWaitlist } from "./waitlist/actions";
import { getCurrentPlayer, getSessionUser } from "@/lib/auth/session";
import { onlinePaymentState } from "@/lib/booking/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { gameEndsAt } from "@/lib/games/duration";
import { gameLanguageOf } from "@/lib/games/language";
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
import { getLocale, getStrings } from "@/lib/i18n/server";

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
    /*
     * `notFound()` HERE, AND HERE SPECIFICALLY (audit F10).
     *
     * The page body calls it too, and that is not enough on its own: this
     * route has a `loading.tsx`, so Next streams a shell as soon as the page
     * begins rendering — and the HTTP status is committed with the first byte.
     * A `notFound()` thrown inside the body arrives after the response has
     * started and cannot change a 200 into a 404. Measured: the body-only
     * version still answered 200, with "Loading…" in the markup.
     *
     * `generateMetadata` is AWAITED BEFORE the stream opens, so throwing from
     * here sets the status properly. The call in the body stays as the guard
     * for anything that reaches it another way.
     */
    void t;
    notFound();
  }

  const { game } = result;
  const title = `${game.venue} — ${formatGameDateTime(game.starts_at)}`;
  // Same ladder the page renders, so the WhatsApp preview and the page it
  // links to never disagree about how urgent the game is.
  const description = `${spotsLeftLabel(
    result.bookedCount,
    game.capacity,
    await getLocale(),
    t,
  )} · ${formatCzk(
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
    /*
     * `notFound()`, NOT A RENDERED APOLOGY (audit F10).
     *
     * This branch used to RETURN a page saying "that game does not exist" —
     * with an HTTP **200**. Measured: `GET /game/00000000-0000-4000-8000-…`
     * answered 200 with that body, while `/player/<nobody>` and `/nope` both
     * correctly answered 404. This route was the outlier.
     *
     * A 200 on a fabricated URL is a page as far as anything mechanical is
     * concerned: a crawler indexes it, a link checker passes it, and a
     * monitoring probe cannot tell a dead game from a live one.
     *
     * `notFound()` renders `app/not-found.tsx`, which already says this
     * better — "Nothing here… or a game that has already been and gone" with
     * a way back to the board — so the hand-rolled copy goes with the status.
     * One not-found screen, in three languages, for every kind of missing
     * thing.
     */
    notFound();
  }

  const { game, bookedCount, spotsLeft, hasStarted, inProgress, isCancelled } = result;
  const roster = await getRoster(game.id);
  // Storage origin for the roster photos. Read here rather than inside
  // `AvatarRow` so the component stays renderable in isolation; absent, every
  // avatar falls back to initials, which is the correct degradation.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const venueRow = await getVenue(game.venue_id);
  /*
   * This game's pitch, falling back to the venue's default (migration 41).
   * Resolved once and passed down, so the header and the WhatsApp draft below
   * cannot disagree about which pitch this game is on.
   */
  const pitchName = effectivePitchName(game.pitch_name, venueRow?.pitch_name);
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

  /*
   * Resolved on the SERVER, from the row RLS already let this caller read.
   * `onlinePaymentState` mirrors `booking_holds_seat()` in SQL, which is the
   * authority — this decides what a panel says, never whether a seat exists.
   */
  const paymentState = ownBooking
    ? onlinePaymentState(ownBooking.booking)
    : ("none" as const);

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
  /*
   * READ WHENEVER THE VIEWER COULD BE ON IT, not only while the game is full.
   *
   * §2.4's waitlisted row does not require `isFull`, and it is right not to: a
   * spot opens, the notify-all mail goes out, and until somebody claims it the
   * game is no longer full while the reader is still in the queue. Gating this
   * on `isFull` showed that reader `Join waitlist` for a list they were
   * already on — which is the exact confusion the row exists to end.
   */
  let alreadyOnList = signedIn && !holdsSpot ? await isOnWaitlist(game.id) : false;

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
      {/*
        THE PREFIX RULE reaches the detail header too (Section 4, item 1) — the
        same helper the pills use, so one game reads identically on the list
        and one tap later. `venueRow` is already fetched here, so the pitch
        name costs nothing extra.
      */}
      <GameHero
        venue={venueDisplayName(game.venue, pitchName)}
        venueRow={venueRow}
        supabaseUrl={supabaseUrl}
      />

      <InfoCard game={game} venueRow={venueRow} endsAt={endsAt} />

      {/*
        NOTES FROM ORGANIZER (round 18, item 6) — A RENAME, NOT A SPLIT, and
        the found reality is worth recording.

        The note was ALREADY its own card outside `InfoCard`, so there was
        nothing to separate. What it was not was legible: its label read "Game
        information" — the same words as the fact card's own heading two
        hundred pixels above — set as a 10px grey eyebrow while every
        neighbouring section carries a `body-lg` white heading. So the page
        said "Game information" twice, once over a list of facts and once over
        a paragraph, in two different type treatments.

        The heading now matches its neighbours, which is what makes the section
        read as one.

        Free text; JSX escapes it, and `whitespace-pre-line` keeps the admin's
        line breaks without interpreting anything else.
      */}
      {game.notes && (
        <div
          data-testid="game-notes"
          className="mt-4 rounded-card bg-surface p-5"
        >
          <h2 className="m-0 text-body-lg font-semibold text-white">
            {t.games.notesLabel}
          </h2>
          <p className="mt-3 mb-0 whitespace-pre-line text-[14px] leading-relaxed text-bone">
            {game.notes}
          </p>
        </div>
      )}

      {/*
        ~~`roster` AND `supabaseUrl`, which drew three faces beside the
        counter.~~ REMOVED (round 16, item 5).

        THE PAGE SHOWED THE SAME PEOPLE TWICE. The faces here are p03's
        summary — the list card's anatomy one size up — and `PlayersList`
        below is the roster proper, avatar and name per row. Each was right
        for its own job when it landed; together on one screen they are one
        set of players rendered twice, and round 14 item 13 made both sets
        clickable, so they became two links to the same profile 300px apart.

        The LIST wins because it answers the question the summary only hints
        at: a face without a name tells a player nothing about whether they
        know anyone going.
      */}
      <AvailabilityCard bookedCount={bookedCount} capacity={game.capacity} />

      {isCancelled && (
        <p className="mt-4 rounded-control border border-hairline-strong px-4 py-3 text-small tracking-[1px] text-faint">
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
          className="mt-4 rounded-control border border-hairline-strong px-4 py-3 text-[11px] tracking-[1px] text-faint"
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
      {/*
        THE AWAITING-PAYMENT PANEL REPLACES the booking panel rather than
        joining it (round 12, item 5a).

        Two boxes about one booking, one saying "spot held" and the other
        "waiting for your payment", is the page contradicting itself — and
        "spot held" is the half that is not true once the window closes. One
        booking, one answer.
      */}
      {ownBooking &&
        (paymentState === "none" ? (
          <YourBookingPanel booking={ownBooking.booking} />
        ) : (
          <AwaitingPaymentPanel
            state={paymentState}
            bookingId={ownBooking.booking.id}
            gameId={game.id}
            canRetry={Boolean(process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL)}
          />
        ))}

      {/*
        THE QUEUE'S CONTROL MOVED TO THE BAR (§2.4); WHAT STAYS HERE IS THE
        HONESTY.

        `waitlistHint` says everyone waiting is told at the same moment a spot
        opens and the race is settled by `create_booking`'s capacity check. It
        cannot go in the bar — there is no room for a sentence beside a button
        — and it must not be dropped: without it a position number reads as a
        serving order, which notify-all FCFS is not.
      */}
      {canAct && !holdsSpot && isFull && (
        <p
          data-testid="full-notice"
          className="mt-4 rounded-card bg-surface p-5 text-body leading-relaxed text-muted"
        >
          <span className="block font-semibold text-bone">{t.games.fullNotice}</span>
          <span className="mt-2 block">{t.games.waitlistHint}</span>
        </p>
      )}

      {/* What the venue provides (§5.7). Nothing renders when nothing is
          recorded — an empty "What's included" card is a claim that the venue
          provides nothing. */}
      <AmenityGrid amenities={venueRow?.amenities ?? null} />

      {/*
        The organizer. The NAME is public — it tells a player who is running
        the game.

        THE NUMBER IS NOT PASSED DOWN (round 9, item 2). The card needs only to
        know WHETHER one is recorded, so it receives a boolean; the digits and
        the prefilled message are assembled inside `/api/wa/<id>`, which
        redirects. That is what keeps them out of the page source entirely —
        round 8's version rendered them as a `wa.me` href.
      */}
      {organizer.name && (
        <OrganizerCard
          name={organizer.name}
          hasPhone={Boolean(organizer.phone)}
          hasTelegram={Boolean(organizer.telegram)}
          gameId={game.id}
          /* Round 18 item 8 — which app the button offers follows the game. */
          language={gameLanguageOf(game.language)}
        />
      )}

      <PlayersList rows={roster} supabaseUrl={supabaseUrl} />

      {/* The queue, in public. Rendered whenever the game is full or anyone is
          already waiting — an empty panel on a half-full game would be noise. */}
      {(isFull || waitlist.length > 0) && (
        <WaitlistPanel rows={waitlist} viewerNickname={viewerNickname} />
      )}

      {/*
        ~~PRACTICAL INFORMATION (§5.7, REQ-GAME-023) — duration, arrival and
        the two rotations, in a card of their own at the bottom of the
        page.~~ REMOVED (round 16, item 4).

        WHY THERE WERE EVER TWO. They came from two different contract
        sections and were never meant to be one card: §5.2 is the fixture's
        facts and §5.7 is "practical information", and while the top card was
        an icon chip row those read as different KINDS of thing. Round 14
        item 12 restyled the top card into a labelled fact list and titled it
        "Game information" — and at that moment the two became indistinguishable
        to a reader: two lists of facts about the same game, 400px apart, one
        called Game information and one called Practical information.

        Nothing duplicated in the CODE, which is why no assertion caught it.
        The duplication was in what the page SAID, and only a person reading
        the whole screen top to bottom could see it.

        Duration and the arrival line moved into the top card, where they
        belong. The two rotation lines went with the section and are not
        replaced — see the report.
      */}

      {/*
        SHARE, LAST BEFORE THE BAR (§3's order: … `Good to know` → share on
        WhatsApp → claim bar).

        It was inside the info card, which put an action about telling someone
        else in the middle of the facts about when and where. It belongs at the
        end, where a reader who has decided the game is worth passing on has
        finished reading.
      */}
      <div className="mt-4">
        <ShareButton
          venue={game.venue}
          when={formatGameDateTime(game.starts_at)}
          url={shareUrl}
        />
      </div>

      {/* Booking created, cancelled, or signed in — whichever the redirect
          that landed here carried. */}
      <ToastFromQuery query={query} />

      {/*
        THE CLAIM BAR, IN EVERY STATE AND ON EVERY RENDER (§2.4, ruling G).
        Unconditional, deliberately: the bar it replaces was bound by
        `canAct && !holdsSpot && !isFull`, which made five of its seven states
        the absence of the control. Which state shows is decided by
        `claimBarState`, which has the precedence and the tests.
      */}
      <ClaimBar
        gameId={game.id}
        bookingId={ownBooking?.booking.id ?? null}
        /* Policy v2, decided in the query layer off the same `now` as
           `canCancel` — see lib/booking/queries.ts. */
        refundable={ownBooking?.refundable ?? true}
        priceCzk={game.price_czk}
        startsAt={game.starts_at}
        facts={{
          isCancelled,
          hasStarted,
          holdsSpot,
          // "Paid" means NOTHING IS OWED, which credit, seed and a confirmed
          // payment all satisfy. Read through the same badge table the account
          // page uses, so the bar and the booking list cannot disagree about
          // whether a player has settled.
          bookingPaid: ownBooking
            ? bookingBadge(
                ownBooking.booking.status,
                ownBooking.booking.payment_method,
              ).tone === "paid"
            : false,
          amountDueCzk: ownBooking
            ? ownBooking.booking.price_czk - ownBooking.booking.credit_applied_czk
            : 0,
          canCancel: ownBooking?.canCancel ?? false,
          onWaitlist: alreadyOnList,
          waitlistPosition: position,
          isFull,
          signedIn,
        }}
      />
    </main>
  );
}
