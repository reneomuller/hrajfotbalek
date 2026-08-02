import { Icon } from "@/components/Icon";
import { amenityItems } from "@/lib/venues/amenities";
import { getStrings } from "@/lib/i18n/server";

/**
 * "What's included" — the icon grid (v1.2 §5.7).
 *
 * FROM THE VENUE'S ROW, NOT FROM A STRING TABLE. The product used to make one
 * blanket promise — "Training bibs, goalie gloves and balls provided." — on the
 * landing page, about every game it would ever run. That was true of the
 * pitches it runs today and there was no way to make it untrue when it stopped
 * being: the first indoor hall that does not lend gloves would have had the
 * page promising them anyway, and the player finds out with cold hands.
 * Migration 38 moves the claim into `venues.amenities`, where an organizer can
 * turn it off.
 *
 * NOTHING RENDERS WHEN NOTHING IS RECORDED. A "What's included" card listing
 * nothing is a card that says the venue provides nothing, which is a claim
 * rather than an absence of one — and a bordered box containing one heading is
 * exactly the empty container v1.2 §8 removes.
 *
 * TWO COLUMNS ON A PHONE, matching the reference's density: at 360px an
 * icon plus a two-word label fits half the width comfortably, and a single
 * column would put ten items down a page nobody scrolls that far.
 */
export async function AmenityGrid({ amenities }: { amenities: string[] | null }) {
  const t = await getStrings();
  const items = amenityItems(amenities, t);

  if (items.length === 0) return null;

  return (
    <section
      data-testid="amenity-grid"
      className="mt-4 rounded-card border border-hairline bg-surface-card p-5"
    >
      <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
        {t.games.includedTitle}
      </h2>

      <ul className="mt-4 grid list-none grid-cols-2 gap-x-4 gap-y-4 p-0">
        {items.map((item) => (
          <li
            key={item.key}
            data-testid="amenity"
            data-amenity={item.key}
            className="flex items-center gap-3"
          >
            {/* The tinted tile is what makes ten glyphs read as one set rather
                than as ten drawings — the reference's facilities grid does the
                same thing, and it is most of why it looks deliberate. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-volt/[.10] text-volt">
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[14px] leading-tight text-bone">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
