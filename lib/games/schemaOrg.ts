import type { Database } from "@/lib/types/database";
import { policy } from "@/lib/policy";
import { strings } from "@/lib/strings";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

/**
 * schema.org `Event` markup for a game page.
 *
 * Game links are shared in WhatsApp and pasted into Google. The Open Graph
 * tags (Phase 13) already own how the link *looks* in a chat; this owns what a
 * search engine understands it to *be* — a dated, located, priced event with a
 * ticket count, which is the difference between a blue link and a result with
 * the kick-off time on it.
 *
 * Kept as a pure function so it is unit-testable without rendering: the
 * failure mode of structured data is silent (a bad `offers` block is simply
 * ignored by the consumer), so the assertions here are the only feedback loop.
 */

/** schema.org availability, as the vocabulary spells it. */
const IN_STOCK = "https://schema.org/InStock";
const SOLD_OUT = "https://schema.org/SoldOut";

/**
 * Event status. `cancelled` is the one that matters: a cancelled game whose
 * link is still circulating should announce itself as cancelled rather than
 * quietly disappearing from the index.
 */
function eventStatus(game: GameRow): string {
  return game.status === "cancelled"
    ? "https://schema.org/EventCancelled"
    : "https://schema.org/EventScheduled";
}

/**
 * End time.
 *
 * `games` has no `ends_at` column — this comes from `policy.game.durationMinutes`,
 * the same display-only constant the "is it happening now" logic uses. See the
 * note on that policy value: nothing transitions on it, and when a real
 * `ends_at` column exists this reads from the column instead.
 */
function endTime(startsAt: string): string {
  const end = new Date(startsAt);
  end.setMinutes(end.getMinutes() + policy.game.durationMinutes);
  return end.toISOString();
}

export interface GameEventSchemaInput {
  game: GameRow;
  spotsLeft: number;
  /** Absolute URL of the game page — schema.org URLs may not be relative. */
  url: string;
  /** Venue display name, from `venues` when the game has one. */
  venueName: string;
  city: string;
}

export function gameEventSchema({
  game,
  spotsLeft,
  url,
  venueName,
  city,
}: GameEventSchemaInput): Record<string, unknown> {
  // "6v6 football · Prazacka". The format leads when the game has one, because
  // that is the thing a player scanning results is deciding on.
  const brand = `${strings.brand.wordmarkLead} ${strings.brand.wordmarkAccent}`;
  const name = game.format
    ? `${game.format} · ${venueName} · ${brand}`
    : `${venueName} · ${brand}`;

  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name,
    description: strings.meta.description,
    url,
    startDate: new Date(game.starts_at).toISOString(),
    endDate: endTime(game.starts_at),
    eventStatus: eventStatus(game),
    // Everyone is physically on a pitch; there is no stream.
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    sport: "Football",
    maximumAttendeeCapacity: game.capacity,
    remainingAttendeeCapacity: spotsLeft,
    location: {
      "@type": "Place",
      name: venueName,
      address: { "@type": "PostalAddress", addressLocality: city },
    },
    organizer: {
      "@type": "Organization",
      name: brand,
      url: new URL("/", url).toString(),
    },
    offers: {
      "@type": "Offer",
      url,
      // Payment is Czech regardless of the language the page is read in — the
      // QR is an SPD string in CZK. The currency here is a fact about the
      // money, not about the locale.
      price: game.price_czk,
      priceCurrency: "CZK",
      availability: spotsLeft > 0 ? IN_STOCK : SOLD_OUT,
      validFrom: new Date(game.created_at).toISOString(),
    },
  };
}
