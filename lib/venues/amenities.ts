import type { IconName } from "@/components/Icon";
import { strings, type Strings } from "@/lib/strings";

/**
 * The venue amenity catalog, app-side.
 *
 * THIS LIST AND `venues_amenities_catalog` ARE ONE RULE IN TWO PLACES, and the
 * CHECK is the enforcement. This exists so an unknown value renders as nothing
 * rather than as a blank icon with a missing label — and so widening the CHECK
 * has an obvious second place to widen, in the same shape as the event-type
 * catalog that has already been forgotten once.
 *
 * THE ORDER HERE IS THE RENDER ORDER, not the order in the column. What the
 * organizer brings comes before what the pitch happens to have, because the
 * first group answers "what do I need to bring" and the second answers "what
 * will it be like when I get there" — and the first question is the one that
 * changes whether someone packs a bag.
 */
/**
 * WHAT THE ORGANIZER BRINGS — the answer to "what do I need to bring".
 *
 * THE GROUPING IS RECOVERED, NOT INVENTED (Section 4, item 2). The column is
 * a flat `text[]` with no group field, but this file's own comment and
 * migration 20260802210000 both describe exactly these two sets: what the
 * organizer brings, then what the pitch happens to have. The render ORDER
 * already encoded the split; this promotes it from a comment to a constant so
 * two headings can read from it.
 *
 * A NEW AMENITY NOW NEEDS A DECISION about which list it joins — which is the
 * cost migration 20260802210000 named when it argued for one list. That
 * argument was about the COLUMN, and the column is unchanged: still one array,
 * still one CHECK, still one grid's worth of data.
 */
export const INCLUDED_AMENITIES = ["bibs", "gloves", "balls", "water", "drinks"] as const;

/** WHAT THE PITCH HAS — "what will it be like when I get there". */
export const PITCH_AMENITIES = ["showers", "lockers", "parking", "wifi", "first_aid"] as const;

export const AMENITIES = [...INCLUDED_AMENITIES, ...PITCH_AMENITIES] as const;

export type Amenity = (typeof AMENITIES)[number];

const ICONS: Record<Amenity, IconName> = {
  bibs: "bibs",
  gloves: "gloves",
  balls: "balls",
  water: "water",
  drinks: "drinks",
  showers: "showers",
  lockers: "lockers",
  parking: "parking",
  wifi: "wifi",
  first_aid: "first_aid",
};

export interface AmenityItem {
  key: Amenity;
  icon: IconName;
  label: string;
}

/**
 * The stored array as a render list, in catalog order, dropping anything this
 * build does not recognise.
 *
 * DROPPING IS THE RIGHT FAILURE. An amenity added to the CHECK and deployed
 * before the app that renders it would otherwise appear as an unlabelled icon —
 * a claim the player cannot read. Silence is a complete answer; a mystery glyph
 * is not.
 */
export function amenityItems(
  stored: string[] | null | undefined,
  t: Strings = strings,
): AmenityItem[] {
  const set = new Set(stored ?? []);
  return AMENITIES.filter((key) => set.has(key)).map((key) => ({
    key,
    icon: ICONS[key],
    label: t.games.amenities[key],
  }));
}
