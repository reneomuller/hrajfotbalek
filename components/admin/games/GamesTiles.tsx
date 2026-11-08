import { SignedCzk } from "@/components/admin/ui/Money";
import { Tile, TileRow } from "@/components/admin/games/Tile";
import type { GamesSummary } from "@/lib/admin/games/summary";
import type { GameTab } from "@/lib/admin/games/tabs";
import { formatSeats } from "@/lib/admin/seatBar";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const hub = strings.admin.gamesHub;

/**
 * The figures above the games list (round 42, the admin rebuild): what the tab
 * on screen adds up to. Upcoming asks "how full, who is queueing, which are
 * paying for their pitch"; Played asks "how full were they, and what did they
 * make". The money tiles wait for the pitch costs — before them a "profit"
 * would be revenue wearing the wrong name — and the Cancelled tab has no
 * figures worth a tile.
 */
export function GamesTiles({ tab, summary }: { tab: GameTab; summary: GamesSummary }) {
  if (tab === "cancelled") return null;

  const seats = `${summary.seatsTaken}/${summary.capacity}`;
  const full = hub.tileFull.replace("{n}", String(summary.fillPercent));
  const { money } = summary;
  const unpaid = (
    <Tile label={hub.tileUnpaid} value={summary.unpaidBookings} detail={hub.tileUnpaidDetail} />
  );

  if (tab === "upcoming") {
    return (
      <TileRow testId="games-tiles">
        <Tile label={hub.tileGames} value={summary.games} />
        <Tile label={hub.tileSeatsBooked} value={seats} detail={full} />
        <Tile label={hub.tileWaiting} value={summary.waiting} detail={hub.tileWaitingDetail} />
        {money ? (
          <Tile
            label={hub.tileCovered}
            value={`${money.coveredGames}/${money.costedGames}`}
            detail={hub.tileCoveredDetail}
            testId="games-tile-covered"
          />
        ) : (
          unpaid
        )}
      </TileRow>
    );
  }

  return (
    <TileRow testId="games-tiles">
      <Tile label={hub.tileGames} value={summary.games} />
      <Tile label={hub.tileSeatsFilled} value={seats} detail={full} />
      {money ? (
        <>
          <Tile
            label={hub.tileRevenue}
            value={formatCzk(money.revenueCzk)}
            detail={hub.tilePitchCosts.replace("{cost}", formatCzk(money.pitchCostCzk))}
            testId="games-tile-revenue"
          />
          <Tile
            label={hub.profit}
            value={<SignedCzk amount={money.profitCzk} />}
            detail={hub.tileInProfit
              .replace("{n}", String(money.coveredGames))
              .replace("{total}", String(money.costedGames))}
            testId="games-tile-profit"
          />
        </>
      ) : (
        <>
          <Tile
            label={hub.tileSeatsPerGame}
            value={formatSeats(summary.games > 0 ? summary.seatsTaken / summary.games : 0)}
            detail={hub.tileSeatsPerGameDetail}
          />
          {unpaid}
        </>
      )}
    </TileRow>
  );
}
