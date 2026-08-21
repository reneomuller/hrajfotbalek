import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRow } from "@/components/admin/AttendanceRow";
import { CancelGameButton } from "@/components/admin/CancelGameButton";
import { ConfirmPaymentRow } from "@/components/admin/ConfirmPaymentRow";
import { GameForm } from "@/components/admin/GameForm";
import { SettleButton } from "@/components/admin/SettleButton";
import { TransitionButton } from "@/components/admin/TransitionButton";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { VenueAmenities } from "@/components/admin/VenueAmenities";
import { VenuePhotoUpload } from "@/components/admin/VenuePhotoUpload";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  activeBookings,
  availableTransitions,
  seatsTaken,
  getAdminGame,
  getGameOrganizer,
  listGameBookings,
  listPitchNameSuggestions,
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
import { publishGameAction, updateGameAction } from "../actions";
import { markPlayedAction } from "./attendance/actions";

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
  void searchParams;
  const [admin, game] = await Promise.all([requireAdmin(), getAdminGame(id)]);
  if (!game) notFound();

  const [bookings, venues, pitchNames, organizer] = await Promise.all([
    listGameBookings(game.id),
    listVenues(),
    listPitchNameSuggestions(),
    getGameOrganizer(game.id),
  ]);

  const venueRow = venues.find((venue) => venue.id === game.venue_id) ?? null;
  const venuePhoto = venueRow?.image_path ?? null;

  const roster = activeBookings(bookings);
  const seatsTakenNow = seatsTaken(bookings, game.guest_count);
  // Already VS-sorted by the query — the order the organizer's banking app
  // lists incoming payments in.
  const pending = unpaidBookings(bookings);

  const { canPublish, canEdit, canPlay, canSettle, canCancel } = availableTransitions(
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
      {game.status !== "draft" && game.status !== "cancelled" && (
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

      {game.status === "draft" && (
        <p className="mt-6 rounded-control border border-hairline-strong px-4 py-3 text-[11px] tracking-[1px] text-faint">
          {strings.admin.draftNotPublic}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {canPublish && (
          <TransitionButton
            action={publishGameAction}
            gameId={game.id}
            label={strings.admin.publishGame}
            testId="publish-game"
          />
        )}

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

      {/* --- reconciliation ---------------------------------------------------
          The only reconciliation surface. There is deliberately no separate
          payment queue: the organizer is looking at their banking app, and a
          second screen to switch to is a second screen to lose. */}
      <section className="mt-12">
        <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.paymentsTitle}
        </h3>

        {pending.length === 0 ? (
          <p className="mt-3 text-[12px] tracking-[1px] text-faint">
            {strings.admin.paymentsEmpty}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-3 p-0">
            {pending.map((booking) => (
              <ConfirmPaymentRow key={booking.id} booking={booking} gameId={game.id} />
            ))}
          </ul>
        )}
      </section>

      {/* --- roster, with attendance on the same rows ---------------------------
          Merged in Phase 18. The two questions at close-out are "did they turn
          up" and "did they pay", and settle is blocked on the second — so the
          payment badge and the attendance controls belong on one row rather
          than one screen apart. */}
      <section className="mt-10">
        <h3 className="m-0 text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.rosterTitle}
        </h3>

        {roster.length === 0 ? (
          <p className="mt-3 text-[12px] tracking-[1px] text-faint">
            {strings.admin.rosterEmpty}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-2 p-0">
            {roster.map((booking) => (
              <AttendanceRow key={booking.id} booking={booking} gameId={game.id} />
            ))}
          </ul>
        )}
      </section>

      {/* --- close-out ---------------------------------------------------------
          The unpaid list is rendered ABOVE the settle button rather than being
          discovered by pressing it: a `reserved` booking surviving into
          `settled` is an unreconciled debt with no surface that will ever raise
          it again. */}
      <section className="mt-10 border-t border-hairline pt-6">
        <h3 className="m-0 mb-4 text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.attendanceTitle}
        </h3>

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

        {!canPlay && !canSettle && game.status !== "settled" && (
          <p className="text-[12px] tracking-[1px] text-faint">
            {strings.admin.settleNeedsPlayed}
          </p>
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
        The pitch photograph, beside the game it belongs to.
        
        On the GAME surface rather than a venue screen there isn't one of: the
        organizer is here anyway, and "add a photo of this pitch" is a thought
        they have while looking at the game, not while browsing a venue list.
        It writes to the venue, so every game at that pitch gets it.
      */}
      {game.venue_id && (
        <section className="mt-12 border-t border-hairline pt-6">
          <h3 className="m-0 mb-3 text-[18px] font-bold uppercase tracking-wide text-bone">
            {strings.admin.venuePhotoTitle}
          </h3>
          <VenuePhotoUpload
            venueId={game.venue_id}
            hasPhoto={Boolean(venuePhoto)}
          />

          {/* What the pitch provides, feeding the game page's "What's
              included" grid. Same surface as the photo and for the same
              reason — and like the photo, it writes to the VENUE, so every
              game at this pitch gets it. */}
          <h3 className="m-0 mb-3 mt-8 text-[18px] font-bold uppercase tracking-wide text-bone">
            {strings.admin.venueAmenitiesTitle}
          </h3>
          <p className="mb-3 max-w-[520px] text-[12px] leading-snug text-muted">
            {strings.admin.venueAmenitiesHint}
          </p>
          <VenueAmenities
            venueId={game.venue_id}
            current={venueRow?.amenities ?? []}
          />
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
            pitchNames={pitchNames}
            game={game}
            organizer={organizer}
            defaultOrganizerName={admin.nickname}
          />
        </section>
      )}

      {canCancel && (
        <div className="mt-10 border-t border-hairline pt-6">
          <CancelGameButton gameId={game.id} venue={game.venue} />
        </div>
      )}
    </>
  );
}
