import { strings, type Strings } from "@/lib/strings";
import type { RosterAvatar } from "@/lib/games/queries";

/**
 * The display name of a seat.
 *
 * THREE KINDS OF GUEST REACH THIS, and they differ only in what they know
 * about themselves:
 *
 *   PARTY  — `guestOf` is the player who brought them. "Karel's Guest 2".
 *   HOUSE  — nothing but an index. "Guest 2".
 *   SHADOW — a pre-round-11 `players` row with no auth user. It has a real
 *            name, typed by an admin in the WhatsApp era, and it keeps it.
 *            This is the whole of "existing shadow players keep rendering".
 *
 * THE FIRST NAME ONLY, for a party guest. "Karel Novák's Guest 2" is a
 * possessive on a full name inside a 34px row that is already carrying two
 * other words; the frames' avatar rows have no room for it, and the owner is
 * standing next to their guests in the same list either way.
 *
 * The apostrophe is NOT built here. English wants "Karel's", Czech and Russian
 * do not form a possessive that way at all, so the whole pattern is one string
 * per language with `{name}` and `{n}` in it.
 */
export function guestLabel(seat: RosterAvatar, t: Strings = strings): string {
  if (!seat.isGuest) return seat.nickname ?? t.games.rosterUnknown;
  if (seat.nickname) return seat.nickname;

  const index = String(seat.guestIndex ?? 1);

  if (seat.guestOf) {
    return t.games.guestOfPlayer
      .replace("{name}", firstName(seat.guestOf))
      .replace("{n}", index);
  }

  return t.games.guestNumbered.replace("{n}", index);
}

/**
 * The first whitespace-separated word of a nickname.
 *
 * A nickname is free text and may be one word, three, or an emoji. Splitting
 * on whitespace and taking the head is the only rule that behaves sensibly for
 * all three; it is not an attempt to parse a personal name.
 */
export function firstName(nickname: string): string {
  return nickname.trim().split(/\s+/)[0] || nickname;
}

/**
 * What goes INSIDE a guest's avatar circle.
 *
 * Never a photograph — a guest has no account and therefore no photo, and a
 * party guest is not a person the product knows anything about. The frames
 * draw an unphotographed avatar as a monogram, so a named guest keeps that
 * treatment and an anonymous one gets the silhouette instead of initials
 * derived from the word "Guest", which would put a row of identical "GU"
 * badges on the card.
 */
export function isAnonymousGuest(seat: RosterAvatar): boolean {
  return seat.isGuest && !seat.nickname;
}
