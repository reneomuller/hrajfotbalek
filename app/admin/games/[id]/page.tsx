import Link from "next/link";
import { notFound } from "next/navigation";
import { RosterRow } from "@/components/admin/RosterRow";
import { CancelGameButton } from "@/components/admin/CancelGameButton";
import { ConfirmPaymentRow } from "@/components/admin/ConfirmPaymentRow";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { GameForm } from "@/components/admin/GameForm";
import { GuestControl } from "@/components/admin/GuestControl";
import { NotifyForm } from "@/components/admin/NotifyForm";
import { StoryDownloadLink } from "@/components/admin/StoryDownloadLink";
import { BreakEvenLine } from "@/components/admin/games/BreakEvenLine";
import { CloseOutPanel } from "@/components/admin/games/CloseOutPanel";
import { MoneyPanel } from "@/components/admin/games/MoneyPanel";
import { PublishedBanner } from "@/components/admin/games/PublishedBanner";
import { SeatMap } from "@/components/admin/games/SeatMap";
import { StatusChip } from "@/components/admin/games/StatusChip";
import { Tile, TileRow } from "@/components/admin/games/Tile";
import { SignedCzk } from "@/components/admin/ui/Money";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { deleteErasesHistory } from "@/lib/admin/gameDelete";
import { breakEvenOutlook } from "@/lib/admin/games/breakEven";
import { getCancelReasons, getGameMoney, type GameMoney } from "@/lib/admin/games/queries";
import { seatBarFromHolders, seatGrid, seatHolders } from "@/lib/admin/games/seatGrid";
import { gameTabOf, gamesListHref } from "@/lib/admin/games/tabs";
import { DEFAULT_GAME_SORT } from "@/lib/admin/gameSort";
import {
  activeBookings,
  availableTransitions,
  getAdminGame,
  getGameOrganizer,
  listGameBookings,
  listOrganizerCandidates,
  listVenues,
  seatsTaken,
  unpaidBookings,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { appCapabilities } from "@/lib/db/capabilities";
import { formatCzk, formatGameDateTime, formatGameTimeSpan } from "@/lib/format";
import { gameEndsAt } from "@/lib/games/duration";
import { strings } from "@/lib/strings";
import { pickableVenues } from "@/lib/venues/archive";
import { venueDisplayName } from "@/lib/venues/displayName";
import { updateGameAction } from "../actions";
import { deleteGameAction } from "./actions";

export const metadata = { title: strings.admin.manageGame };

export const dynamic = "force-dynamic";

const hub = strings.admin.gamesHub;

/** The statuses a player can open the public page of. */
const PUBLIC_STATUSES = new Set(["published", "full", "played", "settled"]);

/**
 * THE game surface (§7, REQ-ADMIN-003; rebuilt in round 42).
 *
 * Everything that acts on one game is here, in the order the organizer meets
 * it: what the game is and how it stands (the header and its figures), who is
 * on it and what they paid (the seat map and the money), the roster where
 * payments are confirmed, then close-out, the venue,
 * editing, and last the two things with no undo.
 *
 * `/edit` and `/attendance` redirect here, so every bookmark, every link in
 * the E2E suite and every URL typed from memory still lands somewhere correct.
 *
 * EVERYTHING PITCH OR PROFIT WAITS FOR `pitchCosts`. Before the migration the
 * money panel is absent and the seat map is coloured from the bookings alone.
 */
export default async function AdminGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  // Set by `createGameAction`'s redirect, and by nothing else.
  const justCreated = query.created === "1";
  const [admin, game] = await Promise.all([requireAdmin(), getAdminGame(id)]);
  if (!game) notFound();

  const [bookings, venues, organizer, capabilities, cancelReasons] = await Promise.all([
    listGameBookings(game.id),
    listVenues(),
    getGameOrganizer(game.id),
    appCapabilities(),
    game.status === "cancelled" ? getCancelReasons([game.id]) : Promise.resolve(new Map<string, string>()),
  ]);
  const [organizerPlayers, money] = await Promise.all([
    // Whoever runs the game now stays in the dropdown even if their organizer
    // status has since been taken away.
    listOrganizerCandidates(organizer?.organizer_player_id ?? null),
    capabilities.pitchCosts ? getGameMoney(game.id) : Promise.resolve<GameMoney | null>(null),
  ]);

  const venueRow = venues.find((venue) => venue.id === game.venue_id) ?? null;
  const roster = activeBookings(bookings);
  const seatsTakenNow = seatsTaken(bookings, game.guest_count);
  // Already VS-sorted by the query — the order the banking app lists payments in.
  const pending = unpaidBookings(bookings);
  const { canEdit, canSettle, canCancel } = availableTransitions(game.status);
  const erasesHistory = deleteErasesHistory(game);
  const tab = gameTabOf(game);
  const upcoming = tab === "upcoming";

  const economics = money?.economics ?? null;
  const holders = seatHolders(bookings, money?.seatValues ?? null);
  const cells = seatGrid({ capacity: game.capacity, houseGuests: game.guest_count, holders });
  const bar = economics ?? seatBarFromHolders({ capacity: game.capacity, houseGuests: game.guest_count, holders });
  const openSeats = Math.max(0, game.capacity - game.activeCount);
  const amenityCount = venueRow?.amenities?.length ?? 0;

  // Under the profit tile: how far an upcoming game is from its pitch, or
  // where a played one's break-even sat.
  let profitDetail: React.ReactNode;
  if (economics && upcoming) {
    profitDetail = <BreakEvenLine outlook={breakEvenOutlook(economics)} testId="game-tile-break-even" />;
  } else if (economics?.breakEvenSeats != null) {
    profitDetail = strings.admin.breakEvenAt.replace("{n}", String(economics.breakEvenSeats));
  }

  return (
    <>
      {/* Back to the tab this game is listed under, so a played game returns
          to the played ones rather than to next week's. */}
      <Link
        href={gamesListHref({ tab, sort: DEFAULT_GAME_SORT })}
        data-testid="admin-game-back"
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      {justCreated && game.status !== "cancelled" && (
        <>
          <PublishedBanner gameId={game.id} />
          {/*
            THE NOTIFICATION OFFER (round 7 item 5; post-publish only since
            round 14 item 11) — prefilled from the row just written, sent only
            when the owner presses the button.
          */}
          <div className="mt-4">
            <NotifyForm
              asOffer
              defaultTitle={strings.admin.notifyDraftGameTitle}
              defaultBody={strings.admin.notifyDraftGameBody
                .replace("{name}", venueDisplayName(game.venue, venueRow?.pitch_name))
                .replace("{when}", formatGameDateTime(game.starts_at))}
            />
          </div>
        </>
      )}

      <div className="mt-4">
        <PageHeader
          title={game.venue}
          testId="admin-game-header"
          lede={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular-nums text-bone">
                {formatGameTimeSpan(game.starts_at, gameEndsAt(game.starts_at, game.duration_minutes))}
              </span>
              <StatusChip status={game.status} testId="admin-game-status" />
            </span>
          }
          actions={
            <>
              <StoryDownloadLink gameId={game.id} testId="story-download" />
              {/* The roster and its payments — the file an organizer opens
                  beside their banking app. */}
              <ExportCsvLink href={`/admin/games/${game.id}/export`} testId="export-roster" />
              {PUBLIC_STATUSES.has(game.status) && (
                <Link
                  href={`/game/${game.id}`}
                  data-testid="game-player-page"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-hairline-strong px-4 text-[11px] uppercase tracking-[1px] text-muted no-underline transition hover:border-hairline-volt hover:text-volt"
                >
                  {strings.admin.gamePublishedViewGame}
                </Link>
              )}
              {canEdit && (
                <a
                  href="#edit-game"
                  data-testid="game-edit-link"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-hairline-volt px-4 text-[11px] uppercase tracking-[1px] text-volt no-underline transition hover:border-volt"
                >
                  {hub.editLink}
                </a>
              )}
            </>
          }
        />
      </div>

      <div className="mt-5">
        <TileRow testId="game-tiles">
          <Tile
            label={hub.tileSeats}
            value={`${game.activeCount}/${game.capacity}`}
            valueTestId="admin-capacity"
            detail={openSeats > 0 ? hub.seatsOpen.replace("{n}", String(openSeats)) : hub.seatsNoneOpen}
          />
          <Tile
            label={hub.tilePrice}
            value={formatCzk(game.price_czk)}
            detail={
              game.duration_minutes ? hub.durationMinutes.replace("{n}", String(game.duration_minutes)) : undefined
            }
          />
          <Tile
            label={strings.admin.waitlistLabel}
            value={game.waitlistCount}
            valueTestId="admin-waitlist-depth"
            detail={hub.tileWaitingOne}
          />
          {economics && economics.profitCzk !== null ? (
            <Tile
              label={hub.profit}
              value={<SignedCzk amount={economics.profitCzk} testId="game-tile-profit" />}
              detail={profitDetail}
            />
          ) : (
            <Tile label={hub.tileUnpaid} value={pending.length} detail={hub.tileUnpaidDetail} />
          )}
        </TileRow>
      </div>

      <div className={`mt-4 grid gap-4 ${economics ? "md:grid-cols-2" : ""}`}>
        <SeatMap bar={bar} seatsTaken={economics?.seatsTaken ?? seatsTakenNow} cells={cells} />
        {economics && (
          <MoneyPanel gameId={game.id} economics={economics} pitch={money?.pitch ?? null} upcoming={upcoming} />
        )}
      </div>

      {/*
        THE ROSTER, one row per booking with how they paid. ~~And attendance~~
        — gone with present / no-show (2026-11-09). What is
        still owed sits at its top — present when there is something to
        reconcile, absent when there is not (round 16, item 16).
      */}
      <Panel
        title={strings.admin.rosterTitle}
        testId="game-roster"
        className="mt-4"
        action={
          <span className="text-[12px] tabular-nums text-muted">
            {roster.length === 1
              ? hub.rosterBookingsOne
              : hub.rosterBookings.replace("{n}", String(roster.length))}
          </span>
        }
      >
        {pending.length > 0 && (
          <div className="mb-4">
            <h3 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-warn">{hub.toConfirm}</h3>
            <ul className="mt-2 list-none space-y-2 p-0">
              {pending.map((booking) => (
                <ConfirmPaymentRow key={booking.id} booking={booking} gameId={game.id} />
              ))}
            </ul>
          </div>
        )}

        {roster.length === 0 ? (
          <p className="m-0 text-[12px] tracking-[1px] text-faint">{strings.admin.rosterEmpty}</p>
        ) : (
          <ul className="list-none space-y-2 p-0">
            {roster.map((booking) => (
              <RosterRow
                key={booking.id}
                booking={booking}
                gameId={game.id}
                canRemove={capabilities.adminRemoveBooking}
                canChooseCredit={capabilities.adminRemoveCreditChoice}
              />
            ))}
          </ul>
        )}

        {/* House guests: seats for people with no account (round 11). */}
        {canEdit && (
          <section data-testid="guests-section" className="mt-5 border-t border-hairline pt-4">
            <h3 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim">
              {strings.admin.guestsTitle}
            </h3>
            <p className="mt-2 max-w-[520px] text-[12px] leading-relaxed text-muted">{strings.admin.guestsLede}</p>
            <GuestControl
              gameId={game.id}
              count={game.guest_count}
              seatsLeft={Math.max(0, game.capacity - seatsTakenNow)}
            />
          </section>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CloseOutPanel
          status={game.status}
          canSettle={canSettle}
          pending={pending}
          cancelReason={cancelReasons.get(game.id) ?? null}
        />

        {/*
          WHAT THE GAME INHERITS FROM ITS VENUE, read-only (round 14, item 2):
          the photo and amenities belong to the venue and are edited there,
          because changing them here would silently change every other game
          at that ground.
        */}
        {game.venue_id && (
          <Panel title={strings.admin.venueInheritedTitle} testId="venue-inherited">
            <p className="m-0 max-w-[520px] text-[12px] leading-snug text-muted">
              {strings.admin.venueInheritedLede}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
              <dt className="text-muted">{strings.admin.venuePhotoTitle}</dt>
              <dd className="m-0 text-bone">
                {venueRow?.image_path ? strings.admin.venueHasPhoto : strings.admin.venueNoPhoto}
              </dd>
              <dt className="text-muted">{strings.admin.venueAmenitiesTitle}</dt>
              <dd className="m-0 text-bone">
                {amenityCount > 0 ? String(amenityCount) : strings.admin.venueNoAmenities}
              </dd>
            </dl>
            <Link
              href="/admin/venues"
              data-testid="edit-venue-link"
              className="mt-4 inline-flex min-h-11 items-center rounded-pill border-2 border-hairline-volt px-4 text-small font-bold text-volt no-underline transition-colors hover:border-volt"
            >
              {strings.admin.venueEditLink}
            </Link>
          </Panel>
        )}
      </div>

      {/* A terminal game shows no form: its time and price are what the roster
          and the ledger already agreed on. */}
      {canEdit && (
        <div id="edit-game" className="mt-4 scroll-mt-24">
          <Panel title={strings.admin.editGameTitle} testId="game-edit">
            <GameForm
              action={updateGameAction}
              venues={pickableVenues(venues, game.venue_id)}
              game={game}
              organizer={organizer}
              defaultOrganizerName={admin.nickname}
              canSetLanguage={capabilities.gameLanguage}
              canSetTelegram={capabilities.organizerTelegram}
              organizerPlayers={capabilities.organizerPlayer ? organizerPlayers : undefined}
            />
          </Panel>
        </div>
      )}

      {/*
        CANCEL, THEN DELETE — the order is the advice: cancelling is what you do
        to a game with people on it. DELETE IS NOT A CHILD OF CANCEL (round 17,
        item 1): it is offered in every status and the RPC refuses only an
        upcoming game with players still on it. A past game's confirm says it
        leaves every player's stats (round 39, item 1).
      */}
      {(canCancel || capabilities.adminDelete) && (
        <Panel title={hub.dangerTitle} testId="game-danger" className="mt-4">
          {canCancel && <p className="m-0 mb-4 max-w-[560px] text-[12px] leading-snug text-muted">{hub.dangerLede}</p>}
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            {canCancel && (
              <div className="min-w-0">
                <CancelGameButton
                  gameId={game.id}
                  venue={game.venue}
                  needsReason={capabilities.cancelWithReason}
                />
              </div>
            )}
            {capabilities.adminDelete && (
              <div>
                <DeleteControl
                  action={deleteGameAction}
                  hiddenFields={{ gameId: game.id }}
                  label={strings.admin.deleteGame}
                  title={
                    erasesHistory
                      ? strings.admin.deleteGamePastConfirmTitle
                      : strings.admin.deleteGameConfirmTitle
                  }
                  body={
                    erasesHistory
                      ? strings.admin.deleteGamePastConfirmBody
                      : strings.admin.deleteGameConfirmBody
                  }
                  confirmLabel={strings.admin.deleteGameConfirm}
                  testId="game-delete"
                />
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
