import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRow } from "@/components/admin/AttendanceRow";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { appCapabilities } from "@/lib/db/capabilities";
import { CancelGameButton } from "@/components/admin/CancelGameButton";
import { ConfirmPaymentRow } from "@/components/admin/ConfirmPaymentRow";
import { GameForm } from "@/components/admin/GameForm";
import { SettleButton } from "@/components/admin/SettleButton";
import { TransitionButton } from "@/components/admin/TransitionButton";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  activeBookings,
  availableTransitions,
  seatsTaken,
  getAdminGame,
  getGameOrganizer,
  listGameBookings,
  listVenues,
  unpaidBookings,
} from "@/lib/admin/queries";
import { formatCzk, formatGameTimeSpan } from "@/lib/format";
import { gameEndsAt } from "@/lib/games/duration";
import { strings } from "@/lib/strings";
import { GuestControl } from "@/components/admin/GuestControl";
import { NotifyForm } from "@/components/admin/NotifyForm";
import { formatGameDateTime } from "@/lib/format";
import { venueDisplayName } from "@/lib/venues/displayName";
import { updateGameAction } from "../actions";
import { markPlayedAction } from "./attendance/actions";
import { deleteGameAction } from "./actions";

export const metadata = { title: strings.admin.manageGame };

export const dynamic = "force-dynamic";

/**
 * THE game surface (§7, REQ-ADMIN-003). Manage and Edit are one page now.
 *
 * WHAT WAS WRONG WITH THREE PAGES. The organizer's actual task is "deal with
 * Sunday's game", and that meant: open the game, notice the time is wrong, go
 * to Edit, come back, confirm two payments, go to Attendance, mark a no-show,
 * settle. Every one of those hops was a page load holding the same game, and
 * the split was along OUR boundaries — which RPC does the write — rather than
 * along anything the organizer was doing.
 *
 * So everything that acts on one game is here, in the order the organizer
 * meets it: what this game is → change it → who has paid → who turned up →
 * close it out → cancel it. Add-player stays a sub-route because it is a
 * creation flow with its own form and its own failure modes, and it is linked
 * from the top of this page rather than buried.
 *
 * `/edit` and `/attendance` now redirect here, so every bookmark, every link
 * in the E2E suite and every URL an organizer typed from memory still lands
 * somewhere correct.
 */
export default async function AdminGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  /*
   * ~~`query.add === "1"` opened the add-player disclosure on arrival from the
   * old `/add-player` route.~~ That flow went in round 11 with shadow players,
   * so nothing reads the search params any more. The PROP stays because the
   * route still accepts them and removing it from the signature would be a
   * change to the page's contract for no gain.
   */
  const query = searchParams ? await searchParams : {};
  // Set by `createGameAction`'s redirect, and by nothing else.
  const justCreated = query.created === "1";
  const [admin, game] = await Promise.all([requireAdmin(), getAdminGame(id)]);
  if (!game) notFound();

  const [bookings, venues, organizer] = await Promise.all([
    listGameBookings(game.id),
    listVenues(),
    getGameOrganizer(game.id),
  ]);

  const venueRow = venues.find((venue) => venue.id === game.venue_id) ?? null;
  const venuePhoto = venueRow?.image_path ?? null;

  const roster = activeBookings(bookings);
  const seatsTakenNow = seatsTaken(bookings, game.guest_count);
  // Already VS-sorted by the query — the order the organizer's banking app
  // lists incoming payments in.
  const pending = unpaidBookings(bookings);

  const capabilities = await appCapabilities();
  const { canEdit, canPlay, canSettle, canCancel } = availableTransitions(
    game.status,
  );

  return (
    <>
      <Link
        href="/admin/games"
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        {/* Free text, escaped by JSX. */}
        <h2 className="m-0 text-[22px] font-bold uppercase tracking-wide text-white">
          {game.venue}
        </h2>
        <div className="flex items-center gap-3">
          <span
            data-testid="admin-game-status"
            className="text-[11px] uppercase tracking-eyebrow text-volt-dim"
          >
            {strings.admin.status[game.status]}
          </span>
          {/* The roster and its payments — the file an organizer opens beside
              their banking app. VS-ordered, with what is actually outstanding
              after wallet credit. */}
          <ExportCsvLink href={`/admin/games/${game.id}/export`} testId="export-roster" />
        </div>
      </div>

      <dl className="mt-4 grid max-w-[420px] grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[12px]">
        <dt className="text-muted">{strings.games.startsLabel}</dt>
        <dd className="m-0 text-bone">
          {formatGameTimeSpan(
            game.starts_at,
            gameEndsAt(game.starts_at, game.duration_minutes),
          )}
        </dd>
        <dt className="text-muted">{strings.games.capacityLabel}</dt>
        <dd className="m-0 text-bone">
          {game.activeCount}/{game.capacity}
        </dd>
        <dt className="text-muted">{strings.games.priceLabel}</dt>
        <dd className="m-0 text-bone">{formatCzk(game.price_czk)}</dd>
        <dt className="text-muted">{strings.admin.waitlistLabel}</dt>
        <dd data-testid="admin-waitlist-depth" className="m-0 text-bone">
          {game.waitlistCount}
        </dd>
      </dl>

      {/*
        THE DRAFT NOTIFICATION OFFER (round 7, item 5).

        Shown on a PUBLISHED game, prefilled from the row that was just
        written. It is an offer and nothing more: editable, dismissible, and
        it sends only when the owner presses the button. Publishing a game
        does not queue a message — there is no code path anywhere that calls
        `publishNotificationAction` without a click.

        WHY HERE RATHER THAN A TOAST. Creating a game redirects to this page,
        so this is where the owner lands with the game fresh in mind. A toast
        would vanish, and a message worth sending is worth more than three
        seconds to decide about.
      */}
      {/*
        ~~Rendered on any published game.~~ POST-PUBLISH ONLY (round 14,
        item 11).

        Round 7's reasoning is intact and is the reason this still exists: a
        message worth sending is worth more than a toast's three seconds, and
        creating a game redirects HERE, so this is where the owner lands with
        it fresh in mind.

        What was wrong is that the condition was "the game is published" rather
        than "the game was just created", so an organizer opening a fixture
        from three weeks ago got a prefilled offer to announce it as new. The
        standing composer on `/admin/site` is the one place to write a message
        that is not about a game you just made.
      */}
      {justCreated && game.status !== "cancelled" && (
        <div className="mt-6">
          <NotifyForm
            asOffer
            defaultTitle={strings.admin.notifyDraftGameTitle}
            defaultBody={strings.admin.notifyDraftGameBody
              .replace("{name}", venueDisplayName(game.venue, venueRow?.pitch_name))
              .replace("{when}", formatGameDateTime(game.starts_at))}
          />
        </div>
      )}

      {/*
        ~~"This game is not public yet" for a draft.~~ REMOVED with the concept
        (round 14, item 1).
      */}

      <div className="mt-6 flex flex-wrap gap-3">
        {/*
          ~~Publish, for a draft.~~ REMOVED (round 14, item 1). There is one
          path now: create a game and it is published. A button whose only
          reachable state is a row nobody can create any more is a button that
          teaches a concept the product no longer has.

          `publish_game` SURVIVES AS AN RPC. It is the only way to move a
          pre-existing draft onto the board, and deleting the repair because
          its button went is the mistake `merge_players` is a standing note
          about.
        */}

      </div>

      {/*
        --- add a player ------------------------------------------------------

        FOLDED IN FROM ITS OWN PAGE (round 9, item 6). It was the last per-game
        admin surface still sitting on a route of its own — Phase 18 merged
        Edit and Attendance into this page and left this one behind, so "deal
        with Sunday's game" still meant one hop out and back.

        It is the same reasoning that merged the other two: the split was along
        OUR boundary — which RPC does the write — rather than along anything
        the organizer is doing. Adding someone who booked over WhatsApp is part
        of managing the game, and it belongs beside the roster it changes.

        BEHIND A DISCLOSURE, because it is a form with four fields and most
        visits to this page do not need it. The roster is what the organizer
        came to read; this opens under it when they need it.
      */}
      {canEdit && (
        <section className="mt-12" data-testid="guests-section">
          <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
            {strings.admin.guestsTitle}
          </h3>
          <p className="mt-2 max-w-[480px] text-[13px] leading-relaxed text-muted">
            {strings.admin.guestsLede}
          </p>
          <GuestControl
            gameId={game.id}
            count={game.guest_count}
            seatsLeft={Math.max(0, game.capacity - seatsTakenNow)}
          />
        </section>
      )}

      {/*
        ~~"Awaiting payment" — a section of its own listing every unpaid
        booking, above the roster that lists the same people again with a
        payment badge on each.~~ THE SECTION IS GONE (round 16, item 16).

        IT WAS A SUMMARY OF THE LIST UNDERNEATH IT. Every name in it appeared
        again twenty pixels lower with its payment state already shown, so an
        organizer read the same roster twice — once filtered, once whole — and
        the filtered copy was the one with the controls on it.

        THE CONTROLS DID NOT GO WITH IT. Confirming a cash payment is still the
        only way a cash booking gets settled, and "amount differs" is still the
        only way an underpayment is recorded. Those rows now render inside the
        roster section with no heading of their own — present when there is
        something to reconcile, absent when there is not, rather than a section
        that exists to say "nothing".
      */}
      {/* --- roster, with attendance on the same rows ---------------------------
          Merged in Phase 18. The two questions at close-out are "did they turn
          up" and "did they pay", and settle is blocked on the second — so the
          payment badge and the attendance controls belong on one row rather
          than one screen apart. */}
      <section className="mt-10">
        <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.rosterTitle}
        </h3>

        {/* What is still owed, where the roster is — see the note above. */}
        {pending.length > 0 && (
          <ul className="mt-4 list-none space-y-3 p-0">
            {pending.map((booking) => (
              <ConfirmPaymentRow key={booking.id} booking={booking} gameId={game.id} />
            ))}
          </ul>
        )}

        {roster.length === 0 ? (
          <p className="mt-3 text-[12px] tracking-[1px] text-faint">
            {strings.admin.rosterEmpty}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-2 p-0">
            {roster.map((booking) => (
              <AttendanceRow
                key={booking.id}
                booking={booking}
                gameId={game.id}
                /* Round 16 item 17 — hidden until the migration exists. */
                canRemove={capabilities.adminRemoveBooking}
              />
            ))}
          </ul>
        )}
      </section>

      {/* --- close-out ---------------------------------------------------------
          The unpaid list is rendered ABOVE the settle button rather than being
          discovered by pressing it: a `reserved` booking surviving into
          `settled` is an unreconciled debt with no surface that will ever raise
          it again. */}
      {/*
        ~~A section headed "Attendance", holding Mark played and Settle.~~ THE
        HEADING IS GONE (round 16, item 16) and so is its placeholder line.

        IT NAMED THE WRONG THING. Attendance is marked on the roster rows
        above, one player at a time; this block has never contained an
        attendance control. What it holds is CLOSE-OUT — the two buttons that
        end a game's life — and on a published game it rendered a heading, no
        buttons and a sentence explaining that there was nothing to do yet.

        THE BUTTONS STAY, bare. They are the only way a game becomes played and
        then settled, and removing them would strand every fixture in
        `published` forever. What went is the chrome around them.
      */}
      <section className="mt-10 border-t border-hairline pt-6">

        {canPlay && (
          <TransitionButton
            action={markPlayedAction}
            gameId={game.id}
            label={strings.admin.markPlayed}
            testId="mark-played"
            tone="secondary"
          />
        )}

        {canSettle && (
          <>
            {pending.length > 0 && (
              <div
                data-testid="settle-outstanding"
                className="mb-4 rounded-card border border-hairline-strong p-4"
              >
                <p className="m-0 text-[13px] text-bone">{strings.admin.settleBlocked}</p>
                <ul className="mt-2 list-none p-0 text-[12px] text-volt">
                  {pending.map((booking) => (
                    <li key={booking.id}>{booking.nickname}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  {strings.admin.settleBlockedHint}
                </p>
              </div>
            )}
            <SettleButton gameId={game.id} />
          </>
        )}

        {game.status === "settled" && (
          <p className=" text-[17px] font-bold uppercase tracking-wide text-volt">
            {strings.admin.settled}
          </p>
        )}
      </section>

      {/* --- edit ---------------------------------------------------------------
          Below the operational surfaces, because changing a game is what an
          organizer does occasionally and reconciling one is what they do every
          week. A terminal game shows no form: its time and price are what the
          roster and the ledger already agreed on. */}
      {/*
        ~~The pitch photograph and the amenity boxes, beside the game they
        belong to — "add a photo of this pitch" is a thought the organizer has
        while looking at the game.~~ MOVED (round 14, item 2).

        They always wrote to the VENUE, which is what made them confusing here:
        editing them from one game silently changed every other game at that
        ground, and the surface gave no hint of that. `/admin/venues` says so
        in its own heading — "Inherited by every game here".

        WHAT REPLACES THEM IS A READ-ONLY SUMMARY. The organizer standing on a
        game still needs to know what it will show, and now gets that without a
        control that edits eleven other games.
      */}
      {game.venue_id && (
        <section className="mt-12 border-t border-hairline pt-6" data-testid="venue-inherited">
          <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
            {strings.admin.venueInheritedTitle}
          </h3>
          <p className="mt-2 max-w-[520px] text-[12px] leading-snug text-muted">
            {strings.admin.venueInheritedLede}
          </p>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
            <dt className="text-muted">{strings.admin.venuePhotoTitle}</dt>
            <dd className="m-0 text-bone">
              {venuePhoto ? strings.admin.venueHasPhoto : strings.admin.venueNoPhoto}
            </dd>
            <dt className="text-muted">{strings.admin.venueAmenitiesTitle}</dt>
            <dd className="m-0 text-bone">
              {(venueRow?.amenities?.length ?? 0) > 0
                ? String(venueRow!.amenities.length)
                : strings.admin.venueNoAmenities}
            </dd>
          </dl>

          <Link
            href="/admin/venues"
            data-testid="edit-venue-link"
            className="mt-4 inline-flex min-h-11 items-center rounded-pill border-2 border-hairline-volt px-4 text-small font-bold text-volt no-underline transition-colors hover:border-volt"
          >
            {strings.admin.venueEditLink}
          </Link>
        </section>
      )}

      {canEdit && (
        <section className="mt-12 border-t border-hairline pt-6">
          <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
            {strings.admin.editGameTitle}
          </h3>
          <GameForm
            action={updateGameAction}
            venues={venues}
            game={game}
            organizer={organizer}
            defaultOrganizerName={admin.nickname}
            canSetLanguage={capabilities.gameLanguage}
            canSetTelegram={capabilities.organizerTelegram}
          />
        </section>
      )}

      {canCancel && (
        <div className="mt-10 border-t border-hairline pt-6">
          <CancelGameButton
            gameId={game.id}
            venue={game.venue}
            needsReason={capabilities.cancelWithReason}
          />
        </div>
      )}

      {/*
        DELETE IS NOT A CHILD OF CANCEL, and round 16 put it inside
        `canCancel` — which was wrong and is the whole of round 17 item 1.
        
        `canCancel` is `draft | published | full`. So a PLAYED, SETTLED or
        CANCELLED game rendered no delete control at all, while
        `admin_delete_game` refuses on BOOKINGS and never on status: an empty
        cancelled game, or a test fixture somebody marked played, is exactly
        what you would want to remove and exactly what the UI never offered.
        Measured across one game of every status before it was changed —
        published 1, full 1, draft 1, played 0, settled 0, cancelled 0.
        
        The two conditions were never the same question. Cancel asks "does
        this game still have a future"; delete asks "is there anything here to
        lose", and only the RPC can answer that — which is why the control is
        now offered unconditionally and the refusal names the next step.
        
        IT STAYS BELOW CANCEL where both render, because the order is still
        the advice: cancelling is what you do to a game with people on it.
      */}
      {capabilities.adminDelete && (
        <div className={canCancel ? "mt-6" : "mt-10 border-t border-hairline pt-6"}>
          <DeleteControl
            action={deleteGameAction}
            hiddenFields={{ gameId: game.id }}
            label={strings.admin.deleteGame}
            title={strings.admin.deleteGameConfirmTitle}
            body={strings.admin.deleteGameConfirmBody}
            confirmLabel={strings.admin.deleteGameConfirm}
            testId="game-delete"
          />
        </div>
      )}
    </>
  );
}
